import axios, { AxiosInstance } from "axios"
import { JiraSettings, settings } from "../constants/settings"

export const jiraPrefixComment = '[Comentário adicionado a partir do Zendesk]';

export default class JiraService {

  instanceSubdomain: string;
  instanceEmail: string;
  instanceToken: string;
  service: AxiosInstance;

  constructor(jiraSettings: JiraSettings) {
    this.instanceSubdomain = jiraSettings.subdomain;
    this.instanceEmail = jiraSettings.email;
    this.instanceToken = jiraSettings.token;

    this.service = axios.create({
      baseURL: `https://${this.instanceSubdomain}.atlassian.net/`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.getBasicAuth()}`
      }
    })
  }

  public async getIssue(id: string | number) {
    const response = await this.service.get(`/rest/api/3/issue/${id}`)
    return response.data;
  }

  public async updateJiraField(issueIdOrKey: string | number, fieldId: string, value: any) {
    const body = {
      fields: {
        [fieldId]: value
      }
    };

    const response = await this.service.put(`/rest/api/3/issue/${issueIdOrKey}`, body);
    return response.data;
  }


  public async getIssueComments(issueId: string | number) {
    const allComments: any[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const response = await this.service.get(`/rest/api/3/issue/${issueId}/comment`, {
        params: { startAt, maxResults }
      });

      const data = response.data;
      allComments.push(...data.comments);

      if (data.startAt + data.maxResults >= data.total) {
        break;
      }

      startAt += maxResults;
    }

    return allComments;
  }


  private getBasicAuth() {
    return btoa(`${this.instanceEmail}:${this.instanceToken}`);
  }

  private extractPathAndQuery(url: string): string {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
  }
}