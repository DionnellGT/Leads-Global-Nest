import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface FacebookLeadData {
  id: string;
  created_time: string;
  form_id?: string;
  field_data: { name: string; values: string[] }[];
  campaign_id?: string;
  campaign_name?: string;
  form_name?: string;
}

@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly baseUrl: string;
  private readonly pageAccessToken: string;

  constructor(private config: ConfigService) {
    const version = this.config.get<string>('FB_GRAPH_API_VERSION', 'v20.0');
    this.baseUrl = `https://graph.facebook.com/${version}`;
    this.pageAccessToken = this.config.get<string>('FB_PAGE_ACCESS_TOKEN')!;
  }

  /**
   * Dado un leadgen_id (que llega por el webhook), pide a la Graph API
   * todos los datos del lead: nombre, correo, teléfono, campaña, etc.
   */
  async getLeadData(leadgenId: string): Promise<FacebookLeadData> {
    const url = `${this.baseUrl}/${leadgenId}`;
    const { data } = await axios.get(url, {
      params: {
        access_token: this.pageAccessToken,
        fields:
          'id,created_time,form_id,field_data,campaign_id,campaign_name,form_name',
      },
    });
    return data;
  }

  /**
   * Convierte el array field_data (formato Meta) en un objeto plano
   * fácil de mapear a las columnas de la tabla leads.
   */
  parseFieldData(fieldData: { name: string; values: string[] }[]) {
    const flat: Record<string, string> = {};
    for (const field of fieldData) {
      flat[field.name] = field.values?.[0] ?? '';
    }
    return flat;
  }
}
