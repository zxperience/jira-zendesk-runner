export const settings: Settings = {
  zendesk: [
    {
      subdomain: 'd3v-zxperience1866',
      email: 'jvilela@zxperience.com',
      token: '',
    },
  ],
  jira: [
    {
      subdomain: 'victorvilela00',
      email: 'victorvilela00@gmail.com',
      token: '',
      linked_issue_zendesk_field_id: '37207553756443',
      sync_fields_jira_to_zendesk: [],
      sync_fields_zendesk_to_jira: [],
    },
  ],
}

export interface Settings {
  zendesk: {
    subdomain: string,
    email: string,
    token: string,
  }[],
  jira: JiraSettings[]
}

export interface JiraSettings {
  subdomain: string,
  email: string,
  token: string,
  linked_issue_zendesk_field_id: string,
  sync_fields_jira_to_zendesk: SyncField[],
  sync_fields_zendesk_to_jira: SyncField[],
}

export interface SyncField {
  jira_field_id: string | number,
  zendesk_field_id: string | number,
  zendesk_field_type?: string,
  jira_field_type?: string,
  is_zendesk_system_field?: boolean,
  is_jira_system_field?: boolean,
  jira_field_value_property?: string
  zendesk_field_value_property?: string
  is_jira_array_field?: boolean
  need_underline?: boolean
  is_date?: boolean
  map?: { from: string, to: string }[]
  is_iso_datetime?: boolean
  is_atlasian_data?: boolean
}