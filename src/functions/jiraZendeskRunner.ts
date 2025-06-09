import { app, InvocationContext, Timer } from "@azure/functions";
import ZendeskService from "../services/ZendeskService";
import { settings } from "../constants/settings";
import { getTicketField } from "../util/zendesk";
import JiraService from "../services/JiraService";
import { areEquivalent } from "../util/string";
import { formatJiraCommentToHtml } from "../util/jira";

export async function jiraZendeskRunner(myTimer: Timer, context: InvocationContext): Promise<void> {
    const zendeskService = new ZendeskService();

    for (var jiraSettings of settings.jira) {
        context.log(`>>> BUSCANDO TICKETS LINKADOS -> [${jiraSettings.subdomain}]`);

        const linkedTickets = await zendeskService.getLinkedTickets(jiraSettings.linked_issue_zendesk_field_id);

        for (var ticket of linkedTickets) {
            const linkedFieldValue = getTicketField(ticket, jiraSettings.linked_issue_zendesk_field_id);
            const issuesIds = linkedFieldValue.replace(/\s+/g, '').split(',')
            const jiraService = new JiraService(jiraSettings);
            context.log('>>>>> IDs:::', issuesIds)

            for (var issueId of issuesIds) {
                const issue = await jiraService.getIssue(issueId);
                context.log('ISSUE:::', issueId);

                // sincronização dos fields
                for (var syncField of jiraSettings.sync_fields) {
                    const issueFieldValue = issue.fields?.[`${syncField.jira_field_id}`];
                    const ticketFieldValue = ticket.custom_fields.find((field: any) => field.id == syncField.zendesk_field_id)?.value;

                    context.log('>>> Sincronização de fields');
                    context.log('ISSUE FIELD VALUE:', issueFieldValue);
                    context.log('TICKET FIELD VALUE:', ticketFieldValue);

                    if (!areEquivalent(issueFieldValue, ticketFieldValue)) {
                        let valueToSet = issueFieldValue;

                        if (syncField.jira_field_id === 'status') {
                            valueToSet = issueFieldValue?.name ?? '';
                        }

                        if (syncField.jira_field_id === 'fixVersions') {
                            valueToSet = issueFieldValue?.map((version: any) => version?.name).join(', ') ?? '';
                        }

                        context.log(`>>> Atualizando field [${syncField.zendesk_field_id}] com o valor: `, valueToSet ?? null);
                        zendeskService.setCustomFieldValue(ticket.id, syncField.zendesk_field_id, valueToSet ?? null);
                    }
                }

                const zendeskComments = await zendeskService.getTicketComments(ticket.id);

                context.log('REQUISITANDO COMENTÁRIO:::', issueId);
                const comments = await jiraService.getIssueComments(issueId);
                const filteredComments = comments.filter((jiraComment: any) => !zendeskComments.some((zendeskComment: any) => zendeskComment.html_body.includes(`ID: ${jiraComment.id}`)));
                const formattedComments = filteredComments.map(formatJiraCommentToHtml);

                for (var comment of formattedComments) {
                    context.log('>>> Adicionando novo comentário ao ticket');
                    await zendeskService.addPrivateComment(ticket.id, comment);
                }

            }
        }

        context.log('>>> LINKED TICKETS:::', linkedTickets.length);
    }
}

app.timer('jiraZendeskRunner', {
    schedule: '0 */3 * * * *',
    handler: jiraZendeskRunner
});
