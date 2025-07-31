import axios, { AxiosInstance } from "axios"

export default class ZendeskService {

  instanceSubdomain: string
  instanceEmail: string
  instanceToken: string
  service: AxiosInstance

  constructor(zendeskSettings: any) {
    this.instanceSubdomain = zendeskSettings.subdomain
    this.instanceEmail = zendeskSettings.email
    this.instanceToken = zendeskSettings.token

    this.service = axios.create({
      baseURL: `https://${this.instanceSubdomain}.zendesk.com/`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.getBasicAuth()}`
      }
    })
  }

  public async getLinkedTickets(fieldId: string): Promise<any[]> {
    const allTickets: any[] = [];
    let nextPageUrl: string | null = this.buildSearchUrl(fieldId);
    let currentPage = 1;

    while (nextPageUrl) {
      console.log(`Buscando tickets - página ${currentPage}`);

      try {
        const path = currentPage > 1 ? this.extractPathAndQuery(nextPageUrl) : nextPageUrl;
        const response: any = await this.service.get(path);

        const { results, count, next_page } = response.data;
        console.log(`✅ Tickets encontrados: ${count}`);

        allTickets.push(...results);
        nextPageUrl = next_page || null;

      } catch (error: any) {
        const message = error?.response?.data ?? error;
        console.error('❌ Erro ao buscar tickets:', message);
        break;
      }

      currentPage++;
    }

    return allTickets;
  }

  private buildSearchUrl(fieldId: string): string {
    // Apenas tickets abertos (status<solved), com qualquer valor no campo customizado
    return `/api/v2/search.json?query=type:ticket status<solved custom_field_${fieldId}:*`;
  }


  public async getTicket(id: string | number) {
    const response = await this.service.get(`/api/v2/tickets/${id}`)
    return response.data.ticket
  }

  public async getGroup(groupId: number | string) {
    try {
      const response = await this.service.get(`/api/v2/groups/${groupId}`);
      return response.data.group;
    } catch (error: any) {
      console.error('>>> Erro ao buscar grupo:', error?.response?.data ?? error);
      throw error;
    }
  }

  public async getTicketComments(ticketId: number | string) {
    let allComments: any[] = [];
    let nextPageUrl: string | null = `/api/v2/tickets/${ticketId}/comments`;
    let currentPage = 1;

    while (nextPageUrl) {
      console.log(`>>> Buscando comentários - página: ${currentPage}`);

      try {
        const response: any = await this.service.get(
          currentPage !== 1 ? this.extractPathAndQuery(nextPageUrl) : nextPageUrl
        );

        const comments = response.data.comments || [];
        console.log(`>>> Comentários encontrados nesta página: ${comments.length}`);

        allComments = allComments.concat(comments);
        nextPageUrl = response.data.next_page || null;

      } catch (error) {
        console.error('>>> Erro ao buscar comentários:', error);
        break;
      }

      currentPage++;
    }

    return allComments;
  }


  public async setCustomFieldValue(ticketId: number | string, fieldId: number | string, value: string) {

    const dataToSend = {
      ticket: {
        custom_fields: [
          {
            id: fieldId,
            value: value
          }
        ]
      }
    }

    const response = await this.service.put(`/api/v2/tickets/${ticketId}`, dataToSend);

    return response.data.ticket.custom_fields.find((field: any) => field.id == fieldId)?.value ?? null
  }

  public async addPrivateComment(ticketId: number | string, comment: string) {
    const dataToSend = {
      ticket: {
        comment: {
          html_body: comment,
          public: false
        }
      }
    };

    const response = await this.service.put(`/api/v2/tickets/${ticketId}`, dataToSend);

    return response.data.ticket?.id ?? null;
  }

  private getBasicAuth() {
    return btoa(`${this.instanceEmail}/token:${this.instanceToken}`);
  }

  private extractPathAndQuery(url: string): string {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
  }
}