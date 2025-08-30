import { app, InvocationContext, Timer } from "@azure/functions";
import ZendeskService from "../services/ZendeskService";
import { settings } from "../constants/settings";
import { getTicketField } from "../util/zendesk";
import JiraService from "../services/JiraService";
import { areEquivalent } from "../util/string";
import { formatJiraCommentToHtml } from "../util/jira";
import axios from "axios";
import { datetimeStringToIso } from "../util/date";

async function processWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>,
    delayMs: number = 2000
) {
    const executing: Promise<void>[] = [];

    for (const item of items) {
        const p = fn(item);
        executing.push(p);

        if (executing.length >= limit) {
            await Promise.all(executing);
            executing.length = 0;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    if (executing.length > 0) {
        await Promise.all(executing);
    }
}



function logError(
    context: InvocationContext,
    message: string,
    error: any,
    options?: {
        jiraAccount?: string;
        zendeskTicketId?: string;
        direction?: "Zendesk -> Jira" | "Jira -> Zendesk";
        zendeskField?: string;
        jiraField?: string;
        value?: any;
    }
) {
    const details = options
        ? ` | Conta Jira: ${options.jiraAccount ?? "N/A"} | Ticket Zendesk: ${
              options.zendeskTicketId ?? "N/A"
          } | Direção: ${options.direction ?? "N/A"} | Campo Zendesk: ${
              options.zendeskField ?? "N/A"
          } | Campo Jira: ${options.jiraField ?? "N/A"} | Valor: ${JSON.stringify(options.value)}`
        : "";

    const fullMessage = `${message}${details}`;

    if (axios.isAxiosError(error)) {
        context.error(fullMessage, error.response?.data ?? error.message);
    } else {
        context.error(fullMessage, error);
    }
}

function logSync(
    context: InvocationContext,
    jiraAccount: string,
    zendeskTicketId: string,
    direction: "Zendesk -> Jira" | "Jira -> Zendesk",
    zendeskField: string,
    jiraField: string,
    value: any
) {
    context.log(
        `[SYNC] Conta Jira: ${jiraAccount} | Ticket Zendesk: ${zendeskTicketId} | Direção: ${direction} | Campo Zendesk: ${zendeskField} | Campo Jira: ${jiraField} | Valor: ${JSON.stringify(
            value
        )}`
    );
}

async function syncZendeskToJiraFields(
    zendeskService: ZendeskService,
    ticket: any,
    issue: any,
    jiraService: JiraService,
    syncFields: any[],
    context: InvocationContext
) {
    await processWithConcurrency(syncFields, 5, async (syncField) => {
        let valueToSet: any = null;
        try {
            if (!syncField.is_zendesk_system_field && getTicketField(ticket, syncField.zendesk_field_id) === undefined) {
                return;
            }

            if (syncField.is_zendesk_system_field) {
                if (syncField.zendesk_field_id === "group_id") {
                    const group = await zendeskService.getGroup(ticket.group_id);
                    valueToSet = group?.name ?? "";
                } else {
                    valueToSet = syncField.zendesk_field_value_property
                        ? ticket?.[syncField.zendesk_field_id]?.[syncField.zendesk_field_value_property] ?? ""
                        : ticket?.[syncField.zendesk_field_id];
                }
            } else {
                valueToSet = ticket.custom_fields.find((field: any) => field.id == syncField.zendesk_field_id)?.value;
            }

            const issueFieldValue = issue.fields?.[syncField.jira_field_id];
            if (areEquivalent(valueToSet, issueFieldValue)) return;

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
                const dateToSet = new Date(new Date(valueToSet.replace(" ", "T")).getTime());
                valueToSet = dateToSet.toISOString().replace("Z", "-0300");
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
                    content: [{type: 'paragraph', content: [{type: 'text', text: valueToSet}]}]
                };
            }

            if (syncField.jira_field_value_property) {
                await jiraService.updateJiraField(issue.key, String(syncField.jira_field_id), {
                    [syncField.jira_field_value_property]: valueToSet ?? null,
                });
            } else {
                await jiraService.updateJiraField(issue.key, String(syncField.jira_field_id), valueToSet ?? null);
            }

            logSync(
                context,
                jiraService.instanceSubdomain,
                ticket.id,
                "Zendesk -> Jira",
                syncField.zendesk_field_id,
                syncField.jira_field_id,
                valueToSet
            );
        } catch (error) {
            logError(context, `Erro ao sincronizar campo [Zendesk->Jira] na issue ${issue.key}`, error, {
                jiraAccount: jiraService.instanceSubdomain,
                zendeskTicketId: ticket.id,
                direction: "Zendesk -> Jira",
                zendeskField: syncField.zendesk_field_id,
                jiraField: syncField.jira_field_id,
                value: valueToSet,
            });
        }
    });
}

async function syncJiraToZendeskFields(
    ticket: any,
    issue: any,
    zendeskService: ZendeskService,
    syncFields: any[],
    context: InvocationContext
) {
    await processWithConcurrency(syncFields, 5, async (syncField) => {
        let valueToSet: any = null;
        try {
            const issueFieldValue = issue.fields?.[syncField.jira_field_id];
            const ticketFieldValue = getTicketField(ticket, syncField.zendesk_field_id);
            if (ticketFieldValue === undefined || areEquivalent(issueFieldValue, ticketFieldValue)) return;

            valueToSet = issueFieldValue;

            if (syncField.is_jira_system_field) {
                if (syncField.is_jira_array_field) {
                    valueToSet =
                        issueFieldValue
                            ?.map((item: any) => item?.[syncField.jira_field_value_property] ?? item?.name)
                            .join(", ") ?? "";
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

            await zendeskService.setCustomFieldValue(ticket.id, syncField.zendesk_field_id, valueToSet ?? null);

            logSync(
                context,
                issue?.self?.split("/")[2] ?? "N/A",
                ticket.id,
                "Jira -> Zendesk",
                syncField.zendesk_field_id,
                syncField.jira_field_id,
                valueToSet
            );
        } catch (error) {
            logError(context, `Erro ao sincronizar campo [Jira->Zendesk] no ticket ${ticket.id}`, error, {
                jiraAccount: issue?.self?.split("/")[2] ?? "N/A",
                zendeskTicketId: ticket.id,
                direction: "Jira -> Zendesk",
                zendeskField: syncField.zendesk_field_id,
                jiraField: syncField.jira_field_id,
                value: valueToSet,
            });
        }
    });
}

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
            (jiraComment: any) =>
                !zendeskComments.some((zendeskComment: any) => zendeskComment.html_body.includes(`ID: ${jiraComment.id}`))
        );

        await processWithConcurrency(newComments, 5, async (comment: any) => {
            const formatted = formatJiraCommentToHtml(comment);
            if (formatted.includes("#zendesk")) {
                await zendeskService.addPrivateComment(ticket.id, formatted);
            }
        });
    } catch (error) {
        logError(context, `Erro ao sincronizar comentários da issue ${issueId} com ticket ${ticket.id}`, error);
    }
}

export async function jiraZendeskRunner(myTimer: Timer, context: InvocationContext): Promise<void> {
    context.log(">>> Iniciando rotina de sincronização");

    await processWithConcurrency(settings.zendesk, 2, async (zendeskSettings) => {
        const zendeskService = new ZendeskService(zendeskSettings);

        await processWithConcurrency(settings.jira, 2, async (jiraSettings) => {
            const jiraService = new JiraService(jiraSettings);

            try {
                const linkedTickets =
                    (await zendeskService.getLinkedTickets(jiraSettings.linked_issue_zendesk_field_id)) ?? [];

                await processWithConcurrency(linkedTickets, 2, async (ticket: any) => {
                    const linkedFieldValue = getTicketField(ticket, jiraSettings.linked_issue_zendesk_field_id);
                    if (!linkedFieldValue) return;

                    const issuesIds = linkedFieldValue.replace(/\s+/g, "").split(",");

                    await processWithConcurrency(issuesIds, 2, async (issueId: string) => {
                        try {
                            const issue = await jiraService.getIssue(issueId);
                            if (!issue) return;

                            await syncZendeskToJiraFields(
                                zendeskService,
                                ticket,
                                issue,
                                jiraService,
                                jiraSettings.sync_fields_zendesk_to_jira,
                                context
                            );
                            await syncJiraToZendeskFields(
                                ticket,
                                issue,
                                zendeskService,
                                jiraSettings.sync_fields_jira_to_zendesk,
                                context
                            );
                            await syncComments(ticket, issueId, zendeskService, jiraService, context);
                        } catch (error) {
                            logError(context, `Erro ao processar issue ${issueId} vinculada ao ticket ${ticket.id}`, error);
                        }
                    });
                });
            } catch (error) {
                logError(context, `Erro na integração com Jira [${jiraSettings.subdomain}]`, error);
            }
        });
    });
}

app.timer("jiraZendeskRunner", {
    schedule: "0 */1 * * * *",
    handler: jiraZendeskRunner,
});
