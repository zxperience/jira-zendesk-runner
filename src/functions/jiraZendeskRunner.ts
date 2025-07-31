import { app, InvocationContext, Timer } from "@azure/functions";
import ZendeskService from "../services/ZendeskService";
import { settings } from "../constants/settings";
import { getTicketField } from "../util/zendesk";
import JiraService from "../services/JiraService";
import { areEquivalent } from "../util/string";
import { formatJiraCommentToHtml } from "../util/jira";
import axios from "axios";

function logError(context: InvocationContext, message: string, error: any) {
    if (axios.isAxiosError(error)) {
        context.log(message, error.response?.data);
    } else {
        context.log(message, error);
    }
}

export async function jiraZendeskRunner(myTimer: Timer, context: InvocationContext): Promise<void> {
    for (var zendeskSettings of settings.zendesk) {
        context.log(`>>> INICIANDO SINCRONIZAÇÃO ZENDESK [v2.3] -> [${zendeskSettings.subdomain}]`);
        const zendeskService = new ZendeskService(zendeskSettings);

        for (var jiraSettings of settings.jira) {
            try {
                context.log(`>>> BUSCANDO TICKETS LINKADOS -> [${jiraSettings.subdomain}]`);

                const linkedTickets = (await zendeskService.getLinkedTickets(jiraSettings.linked_issue_zendesk_field_id)) ?? [];

                for (var ticket of linkedTickets) {
                    console.log('>>>>>>>>>> Ticket ID:', ticket.id);
                    try {
                        const linkedFieldValue = getTicketField(ticket, jiraSettings.linked_issue_zendesk_field_id);
                        if (!linkedFieldValue) continue;

                        const issuesIds = linkedFieldValue?.replace(/\s+/g, '').split(',');
                        const jiraService = new JiraService(jiraSettings);
                        context.log('>>>>> IDs:::', issuesIds);

                        for (var issueId of issuesIds) {
                            let issue = null;
                            try {
                                issue = await jiraService.getIssue(issueId);
                            } catch (error) {
                                logError(context, `ERRO AO BUSCAR ISSUE: ${issueId}`, error);
                                continue;
                            }

                            if (!issue) {
                                context.log('ISSUE NÃO ENCONTRADA:', issueId);
                                continue;
                            }

                            context.log('ISSUE:::', issueId);

                            try {
                                for (var syncField of jiraSettings.sync_fields_zendesk_to_jira) {
                                    context.log(`>>>>>>>>>> ZENDESK TO JIRA. ZENDESK: ${syncField.zendesk_field_id} JIRA: ${syncField.jira_field_id}`);
                                    if (!syncField.is_zendesk_system_field && getTicketField(ticket, syncField.zendesk_field_id) === undefined) {
                                        context.log('CAMPO NÃO ENCONTRADO NO ZENDESK. PULANDO...');
                                        continue;
                                    }

                                    let ticketFieldValue = null;
                                    if (syncField.is_zendesk_system_field) {
                                        if (syncField.zendesk_field_id === 'group_id') {
                                            const groupId = ticket.group_id;
                                            const group = await zendeskService.getGroup(groupId);
                                            ticketFieldValue = group?.name ?? '';
                                        } else {
                                            ticketFieldValue = syncField.zendesk_field_value_property
                                                ? ticket?.[syncField.zendesk_field_id]?.[syncField.zendesk_field_value_property] ?? ''
                                                : ticket?.[syncField.zendesk_field_id];
                                        }
                                    } else {
                                        ticketFieldValue = ticket.custom_fields.find((field: any) => field.id == syncField.zendesk_field_id)?.value;
                                    }

                                    const issueFieldValue = issue.fields?.[`${syncField.jira_field_id}`];
                                    context.log('>>> Sincronização de fields (Zendesk -> Jira)');
                                    context.log('TICKET FIELD VALUE:', ticketFieldValue);

                                    if (!areEquivalent(ticketFieldValue, issueFieldValue)) {
                                        let valueToSet = ticketFieldValue;

                                        if (syncField.map && Array.isArray(syncField.map)) {
                                            const mappings = new Map(syncField.map.map(entry => [entry.from, entry.to]));
                                            if (typeof valueToSet === 'string' && valueToSet.includes(',')) {
                                                valueToSet = valueToSet.split(',').map(val => mappings.get(val.trim()) ?? val.trim()).join(', ');
                                            } else if (typeof valueToSet === 'string') {
                                                valueToSet = mappings.get(valueToSet) ?? valueToSet;
                                            }
                                        }

                                        if (syncField.is_date) {
                                            const dateToSet = new Date(new Date(valueToSet.replace(' ', 'T')).getTime());
                                            valueToSet = dateToSet.toISOString().replace('Z', '-0300');
                                        }

                                        if (syncField.need_underline) {
                                            valueToSet = valueToSet.replace(/\s+/g, '_');
                                        }

                                        if (syncField.is_jira_array_field) {
                                            valueToSet = [valueToSet];
                                        }

                                        context.log(`>>> Atualizando field no Jira [${syncField.jira_field_id}] com o valor: `, valueToSet ?? null);

                                        if (syncField.jira_field_value_property) {
                                            await jiraService.updateJiraField(issueId, String(syncField.jira_field_id), {
                                                [syncField.jira_field_value_property]: valueToSet ?? null
                                            });
                                        } else {
                                            await jiraService.updateJiraField(issueId, String(syncField.jira_field_id), valueToSet ?? null);
                                        }
                                    } else {
                                        context.log('não atualiza valores, equivalente. Zendesk field ID:', syncField.zendesk_field_id);
                                    }
                                }
                            } catch (error) {
                                logError(context, `>>> Erro ao sincronizar campos do Zendesk para o Jira na issue ${issueId}`, error);
                            }

                            try {
                                for (var syncField of jiraSettings.sync_fields_jira_to_zendesk) {
                                    const issueFieldValue = issue.fields?.[`${syncField.jira_field_id}`];
                                    const ticketFieldValue = getTicketField(ticket, syncField.zendesk_field_id);

                                    context.log(`JIRA TO ZENDESK. JIRA: ${syncField.jira_field_id} ZENDESK: ${syncField.zendesk_field_id}`);
                                    if (ticketFieldValue === undefined) {
                                        context.log('CAMPO NÃO ENCONTRADO NO ZENDESK. PULANDO...');
                                        continue;
                                    }

                                    context.log('>>> Sincronização de fields (Jira -> Zendesk)');
                                    context.log('ISSUE FIELD VALUE:', issueFieldValue);
                                    context.log('TICKET FIELD VALUE:', ticketFieldValue);

                                    if (!areEquivalent(issueFieldValue, ticketFieldValue)) {
                                        let valueToSet = issueFieldValue;

                                        if (syncField.is_jira_system_field) {
                                            if (syncField.is_jira_array_field) {
                                                valueToSet = issueFieldValue?.map((item: any) => item?.[syncField.jira_field_value_property] ?? item?.name).join(', ') ?? '';
                                            } else {
                                                valueToSet = syncField.jira_field_value_property ? issueFieldValue?.[syncField.jira_field_value_property] ?? '' : issueFieldValue ?? '';
                                            }
                                        }

                                        if (syncField.map && Array.isArray(syncField.map)) {
                                            const mappings = new Map(syncField.map.map(entry => [entry.from, entry.to]));
                                            if (typeof valueToSet === 'string' && valueToSet.includes(',')) {
                                                valueToSet = valueToSet.split(',').map(val => mappings.get(val.trim()) ?? val.trim()).join(', ');
                                            } else if (typeof valueToSet === 'string') {
                                                valueToSet = mappings.get(valueToSet) ?? valueToSet;
                                            }
                                        }

                                        if (syncField.need_underline) {
                                            valueToSet = valueToSet.replace(/\s+/g, '_');
                                        }

                                        context.log(`>>> Atualizando field no Zendesk [${syncField.zendesk_field_id}] com o valor: `, valueToSet ?? null);
                                        await zendeskService.setCustomFieldValue(ticket.id, syncField.zendesk_field_id, valueToSet ?? null);
                                    }
                                }
                            } catch (error) {
                                logError(context, `>>> Erro ao sincronizar campos do Jira para o Zendesk no ticket ${ticket.id}`, error);
                            }

                            try {
                                const zendeskComments = await zendeskService.getTicketComments(ticket.id);
                                const comments = await jiraService.getIssueComments(issueId);
                                const filteredComments = comments.filter((jiraComment: any) =>
                                    !zendeskComments.some((zendeskComment: any) =>
                                        zendeskComment.html_body.includes(`ID: ${jiraComment.id}`)
                                    )
                                );
                                const formattedComments = filteredComments.map(formatJiraCommentToHtml);

                                for (var comment of formattedComments) {
                                    if (!comment.includes('#zendesk')) {
                                        console.log('>>> Comentário não contém #zendesk, pulando');
                                        continue;
                                    }
                                    context.log('>>> Adicionando novo comentário ao ticket');
                                    await zendeskService.addPrivateComment(ticket.id, comment);
                                }
                            } catch (error) {
                                logError(context, `>>> Erro ao sincronizar comentários da issue ${issueId} com o ticket ${ticket.id}`, error);
                            }
                        }
                    } catch (error) {
                        logError(context, `>>> Erro ao processar o ticket [${ticket.id}]`, error);
                    }
                }

                context.log('>>> LINKED TICKETS:::', linkedTickets.length);
            } catch (error) {
                logError(context, `ERRO NA INTEGRAÇÃO -> [${jiraSettings.subdomain}]`, error);
            }
        }
    }
}

app.timer('jiraZendeskRunner', {
    schedule: '0 */1 * * * *',
    handler: jiraZendeskRunner
});
