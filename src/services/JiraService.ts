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

    public async getIssueComments(id: string | number) {
    const response = await this.service.get(`/rest/api/3/issue/${id}/comment`)
    return response.data.comments;
  }

  private getBasicAuth() {
    return btoa(`${this.instanceEmail}:${this.instanceToken}`);
  }

  private extractPathAndQuery(url: string): string {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
  }
}