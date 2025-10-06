import { app, InvocationContext, Timer } from "@azure/functions";
import ZendeskService from "../services/ZendeskService";
import { settings } from "../constants/settings";
import { getTicketField } from "../util/zendesk";
import JiraService from "../services/JiraService";
import { areEquivalent } from "../util/string";
import { formatJiraCommentToHtml, getIssueSubdomain } from "../util/jira";
import axios from "axios";
import { datetimeStringToIso, formatToISOWithOffset } from "../util/date";


function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

//log de erros
function logError(context: InvocationContext, message: string, error: any) {
    if (axios.isAxiosError(error)) {
        context.error(message, error.response?.data ?? error.message);
    } else {
        context.error(message, error);
    }
}

//log de sincronização
function logSync(
    context: InvocationContext,
    jiraAccount: string,
    zendeskTicketId: string,
    issueJiraKey: string,
    direction: "Zendesk -> Jira" | "Jira -> Zendesk",
    zendeskField: string,
    jiraField: string,
    value: any
) {
    context.log(
        `[SYNC] Conta Jira: ${jiraAccount} | Ticket Zendesk: ${zendeskTicketId} | Issue Jira: ${issueJiraKey} | Direção: ${direction} | Campo Zendesk: ${zendeskField} | Campo Jira: ${jiraField} | Valor: ${JSON.stringify(value)}`
    );
}

// Sincronização Zendesk -> Jira
async function syncZendeskToJiraFields(
    zendeskService: ZendeskService,
    ticket: any,
    issue: any,
    jiraService: JiraService,
    syncFields: any[],
    context: InvocationContext
) {
    await Promise.allSettled(
        syncFields.map(async (syncField) => {
            try {
                if (!syncField.is_zendesk_system_field && getTicketField(ticket, syncField.zendesk_field_id) === undefined) {
                    return;
                }

                let ticketFieldValue: any = null;
                if (syncField.is_zendesk_system_field) {
                    if (syncField.zendesk_field_id === "group_id") {
                        const group = await zendeskService.getGroup(ticket.group_id);
                        ticketFieldValue = group?.name ?? "";
                    } else {
                        ticketFieldValue = syncField.zendesk_field_value_property
                            ? ticket?.[syncField.zendesk_field_id]?.[syncField.zendesk_field_value_property] ?? ""
                            : ticket?.[syncField.zendesk_field_id];
                    }
                } else {
                    ticketFieldValue = ticket.custom_fields.find((field: any) => field.id == syncField.zendesk_field_id)?.value;
                }

                const issueFieldValue = issue.fields?.[syncField.jira_field_id];
                if (areEquivalent(ticketFieldValue, issueFieldValue)) return;

                let valueToSet = ticketFieldValue;

                if (syncField.map) {
                    const mappings = new Map(syncField.map.map((entry: any) => [entry.from, entry.to]));
                    if (typeof valueToSet === "string" && valueToSet.includes(",")) {
                        valueToSet = valueToSet
                            .split(",")
                            .map((val) => mappings.get(val.trim()) ?? val.trim())
                            .join(", ");
                    } else if (typeof valueToSet === "string") {
                        valueToSet = mappings.get(valueToSet) ?? valueToSet;
                    }
                }

                if (syncField.is_date) {
                    if (valueToSet === null || valueToSet === "") {
                        valueToSet = null;
                    } else {
                        const dateToSet = new Date(new Date(valueToSet.replace(" ", "T")).getTime());
                        valueToSet = dateToSet.toISOString().replace("Z", "-0300");
                    }
                }

                if (syncField.is_datetime) {
                    if (valueToSet === null || valueToSet === "") {
                        valueToSet = null;
                    } else {
                        valueToSet = formatToISOWithOffset(valueToSet);
                    }
                }
                if (syncField.is_iso_datetime) {
                    valueToSet = datetimeStringToIso(valueToSet);
                }
                if (syncField.need_underline) {
                    valueToSet = valueToSet.replace(/\s+/g, "_");
                }
                if (syncField.is_jira_array_field) {
                    valueToSet = [valueToSet];
                }

                if (syncField.is_atlasian_data) {
                    valueToSet = {
                        type: 'doc',
                        version: 1,
                        content: [{ type: 'paragraph', content: [{ type: 'text', text: valueToSet }] }]
                    };
                }

                if (syncField.jira_field_value_property) {
                    await jiraService.updateJiraField(issue.key, String(syncField.jira_field_id), {
                        [syncField.jira_field_value_property]: valueToSet ?? null,
                    });
                } else {
                    await jiraService.updateJiraField(issue.key, String(syncField.jira_field_id), valueToSet ?? null);
                }

                logSync(context, jiraService.instanceSubdomain, ticket.id, issue.key, "Zendesk -> Jira", syncField.zendesk_field_id, syncField.jira_field_id, valueToSet);
            } catch (error) {
                logError(context, `Erro de sincronização [Zendesk->Jira] - ticket id: ${ticket.id} | campo Zendesk: ${syncField.zendesk_field_id} | issue: ${issue.key} [${jiraService.instanceSubdomain}] | campo Jira: ${syncField.jira_field_id}`, error);
            }
        })
    );
}

async function syncJiraToZendeskFields(
    ticket: any,
    issue: any,
    zendeskService: ZendeskService,
    syncFields: any[],
    context: InvocationContext
) {
    try {
        const fieldsToUpdate: { id: number | string; value: any }[] = [];

        for (const syncField of syncFields) {
            try {
                const issueFieldValue = issue.fields?.[syncField.jira_field_id];

                let valueToSet = issueFieldValue;
                if (syncField.is_jira_system_field) {
                    if (syncField.is_jira_array_field) {
                        valueToSet =
                            issueFieldValue?.map((item: any) => item?.[syncField.jira_field_value_property] ?? item?.name).join(", ") ?? "";
                    } else {
                        valueToSet = syncField.jira_field_value_property
                            ? issueFieldValue?.[syncField.jira_field_value_property] ?? ""
                            : issueFieldValue ?? "";
                    }
                }

                if (syncField.map) {
                    const mappings = new Map(syncField.map.map((entry: any) => [entry.from, entry.to]));
                    if (typeof valueToSet === "string" && valueToSet.includes(",")) {
                        valueToSet = valueToSet
                            .split(",")
                            .map((val) => mappings.get(val.trim()) ?? val.trim())
                            .join(", ");
                    } else if (typeof valueToSet === "string") {
                        valueToSet = mappings.get(valueToSet) ?? valueToSet;
                    }
                }
                if (syncField.need_underline) {
                    valueToSet = valueToSet.replace(/\s+/g, "_");
                }

                if (syncField.is_atlasian_data) {
                    if (valueToSet?.content) {
                        valueToSet = valueToSet.content[0]?.content?.[0]?.text ?? null;
                    } else {
                        valueToSet = null;
                    }
                }

                fieldsToUpdate.push({
                    id: syncField.zendesk_field_id,
                    value: valueToSet ?? null,
                });

                logSync(context, issue?.self?.split("/")[2] ?? "N/A", ticket.id, issue.key, "Jira -> Zendesk", syncField.zendesk_field_id, syncField.jira_field_id, valueToSet);
            } catch (error) {
                logError(context, `Erro de sincronização [Jira->Zendesk] - ticket id: ${ticket.id} | campo Zendesk: ${syncField.zendesk_field_id} | issue: ${issue.key} [${getIssueSubdomain(issue)}] | campo Jira: ${syncField.jira_field_id}`, error);
            }
        }

        if (fieldsToUpdate.length > 0) {
            await zendeskService.setMultipleCustomFields(ticket.id, fieldsToUpdate);
        }
    } catch (error) {
        logError(context, `Erro ao sincronizar campos Jira->Zendesk para ticket ${ticket.id}`, error);
    }
}


// Sincronização de comentários
async function syncComments(
    ticket: any,
    issueId: string,
    zendeskService: ZendeskService,
    jiraService: JiraService,
    context: InvocationContext
) {
    try {
        const [zendeskComments, jiraComments] = await Promise.all([
            zendeskService.getTicketComments(ticket.id),
            jiraService.getIssueComments(issueId),
        ]);

        const newComments = jiraComments.filter(
            (jiraComment: any) => !zendeskComments.some((zendeskComment: any) => zendeskComment.html_body.includes(`ID: ${jiraComment.id}`))
        );

        await Promise.allSettled(
            newComments.map(async (comment: any) => {
                const formatted = formatJiraCommentToHtml(comment);
                if (formatted.includes("#zendesk")) {

                    if (ticket.status != "closed") {
                        await zendeskService.addPrivateComment(ticket.id, formatted);
                    }
                }
            })
        );
    } catch (error) {
        logError(context, `Erro ao sincronizar comentários da issue ${issueId} com ticket ${ticket.id}`, error);
    }
}

export async function jiraZendeskRunner(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(">>> Iniciando rotina de sincronização");

    await Promise.allSettled(
        settings.zendesk.map(async (zendeskSettings) => {
            const zendeskService = new ZendeskService(zendeskSettings);

            await Promise.allSettled(
                settings.jira.map(async (jiraSettings) => {
                    const jiraService = new JiraService(jiraSettings);
                    try {
                        const linkedTickets =
                            (await zendeskService.getLinkedTickets(jiraSettings.linked_issue_zendesk_field_id)) ?? [];

                        await Promise.allSettled(
                            linkedTickets.map(async (ticket: any) => {
                                try {
                                    const linkedFieldValue = getTicketField(ticket, jiraSettings.linked_issue_zendesk_field_id);
                                    if (!linkedFieldValue) return;

                                    const issuesIds = linkedFieldValue.replace(/\s+/g, "").split(",");
                                    await Promise.allSettled(
                                        issuesIds.map(async (issueId: string) => {
                                            try {
                                                const issue = await jiraService.getIssue(issueId);
                                                if (!issue) return;

                                                await syncZendeskToJiraFields(zendeskService, ticket, issue, jiraService, jiraSettings.sync_fields_zendesk_to_jira, context);
                                                await syncJiraToZendeskFields(ticket, issue, zendeskService, jiraSettings.sync_fields_jira_to_zendesk, context);
                                                await syncComments(ticket, issueId, zendeskService, jiraService, context);
                                            } catch (error) {
                                                logError(context, `Erro ao processar issue ${issueId} vinculada ao ticket ${ticket.id}`, error);
                                            }
                                        })
                                    );
                                } catch (error) {
                                    logError(context, `Erro ao processar ticket ${ticket.id}`, error);
                                }
                            })
                        );
                    } catch (error) {
                        logError(context, `Erro na integração com Jira [${jiraSettings.subdomain}]`, error);
                    }
                })
            );
        })
    );
}

app.timer("jiraZendeskRunner", {
    schedule: "0 */11 * * * *",
    handler: jiraZendeskRunner,
});
