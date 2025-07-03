export const settings: Settings = {
  zendesk: {
    subdomain: 'cxsenior1643201684',
    email: 'gapolinario@zxperience.com',
    token: '',
  },
  jira: [
    {
      subdomain: 'megasistemas',
      email: 'jiramega.zendesk@senior.com.br',
      token: '',
      linked_issue_zendesk_field_id: '37675812791316',
      sync_fields: [
        {
          jira_field_id: 'customfield_17262',
          zendesk_field_id: '360045575892'
        },
        {
          jira_field_id: 'customfield_17163',
          zendesk_field_id: '360044429192'
        },
        {
          jira_field_id: 'customfield_17161',
          zendesk_field_id: '360044030051'
        },
        {
          jira_field_id: 'customfield_17169',
          zendesk_field_id: '360038543151'
        },
        {
          jira_field_id: 'customfield_17167',
          zendesk_field_id: '360044030471'
        },
        {
          jira_field_id: 'status',
          zendesk_field_id: '360046905051'
        },
        {
          jira_field_id: 'customfield_17164',
          zendesk_field_id: '360044024752'
        },
        {
          jira_field_id: 'customfield_17227',
          zendesk_field_id: '360047190211'
        },
        {
          jira_field_id: 'customfield_17228',
          zendesk_field_id: '360044037571'
        },
        {
          jira_field_id: 'customfield_17229',
          zendesk_field_id: '360038543171'
        },
        {
          jira_field_id: 'fixVersions',
          zendesk_field_id: '1900000163227'
        },
        {
          jira_field_id: 'customfield_17121',
          zendesk_field_id: '1900000223107'
        },
        {
          jira_field_id: 'customfield_17170',
          zendesk_field_id: '1900000791827'
        },
        {
          jira_field_id: 'customfield_17129',
          zendesk_field_id: '1900000817327'
        },
        {
          jira_field_id: 'customfield_17162',
          zendesk_field_id: '1900001430487'
        }, 
        {
          jira_field_id: 'customfield_17230',
          zendesk_field_id: '15028699347092'
        },
        {
          jira_field_id: 'customfield_17165',
          zendesk_field_id: '360045181931'
        },
      ],
    },
    {
      subdomain: 'ilog',
      email: 'suporte@ilog.com.br',
      token: '',
      linked_issue_zendesk_field_id: '',
      sync_fields: []
    }
  ],
}

export interface Settings {
  zendesk: {
    subdomain: string,
    email: string,
    token: string,
  },
  jira: JiraSettings[]
}

export interface JiraSettings {
  subdomain: string,
  email: string,
  token: string,
  linked_issue_zendesk_field_id: string,
  sync_fields: SyncField[],
}

export interface SyncField {
  jira_field_id: string | number,
  zendesk_field_id: string | number,
}