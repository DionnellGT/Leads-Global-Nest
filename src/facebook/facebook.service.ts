import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';

export interface FacebookLeadData {
  id: string;
  created_time: string;
  form_id?: string;
  field_data: { name: string; values: string[] }[];
  campaign_id?: string;
  campaign_name?: string;
}

/**
 * Error de dominio que envuelve las respuestas de error de la Graph API,
 * clasificándolas para que quien las capture (LeadsService) sepa si vale
 * la pena alertar o si es un caso esperado (ej. lead de prueba/simulado).
 */
export class GraphApiError extends Error {
  constructor(
    message: string,
    public readonly fbCode?: number,
    public readonly fbSubcode?: number,
    public readonly isSimulatedLead = false,
  ) {
    super(message);
    this.name = 'GraphApiError';
  }
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
    try {
      const { data } = await axios.get(url, {
        params: {
          access_token: this.pageAccessToken,
          fields: 'id,created_time,form_id,field_data,campaign_id,campaign_name',
        },
      });
      return data;
    } catch (err) {
      throw this.toGraphApiError(err, leadgenId);
    }
  }

  /**
   * El nombre del formulario no viene incluido en el objeto lead,
   * así que se consulta aparte (opcional: si falla, no debe frenar
   * el guardado del lead, solo se guarda sin nombre de formulario).
   */
  async getFormName(formId: string): Promise<string | undefined> {
    try {
      const url = `${this.baseUrl}/${formId}`;
      const { data } = await axios.get(url, {
        params: { access_token: this.pageAccessToken, fields: 'name' },
      });
      return data.name;
    } catch (err) {
      this.logger.warn(
        `No se pudo obtener el nombre del formulario ${formId}: ${(err as Error).message}`,
      );
      return undefined;
    }
  }

  /**
   * Traduce el error crudo de Axios/Graph API en un GraphApiError,
   * distinguiendo el caso típico de "lead simulado desde el panel de
   * Meta" (leadgen_id que no existe realmente, ej. el botón "Probar")
   * de otros errores que sí ameritan revisión (token vencido, permisos,
   * rate limit, etc.).
   */
  private toGraphApiError(err: unknown, leadgenId: string): GraphApiError {
    if (!isAxiosError(err)) {
      return new GraphApiError(
        `Error inesperado consultando el lead ${leadgenId}: ${(err as Error).message}`,
      );
    }

    const fbError = err.response?.data?.error;
    const fbCode: number | undefined = fbError?.code;
    const fbSubcode: number | undefined = fbError?.error_subcode;
    const fbMessage: string = fbError?.message ?? err.message;

    // code 100 + subcode 33: "Object does not exist" — el caso típico
    // cuando Meta envía un leadgen_id ficticio (ej. botón "Probar" del
    // panel, o eventos de webhooks de prueba en general).
    const isSimulatedLead = fbCode === 100 && fbSubcode === 33;

    if (isSimulatedLead) {
      return new GraphApiError(
        `El leadgen_id "${leadgenId}" no existe en Meta (probablemente un evento de prueba simulado, no un lead real).`,
        fbCode,
        fbSubcode,
        true,
      );
    }

    if (fbCode === 190) {
      return new GraphApiError(
        `Token de acceso inválido o vencido al consultar el lead ${leadgenId}. Revisa FB_PAGE_ACCESS_TOKEN.`,
        fbCode,
        fbSubcode,
      );
    }

    if (fbCode === 10 || fbCode === 200) {
      return new GraphApiError(
        `Permisos insuficientes para leer el lead ${leadgenId} (revisa leads_retrieval / pages_manage_metadata).`,
        fbCode,
        fbSubcode,
      );
    }

    return new GraphApiError(
      `Error de la Graph API al consultar el lead ${leadgenId}: ${fbMessage}`,
      fbCode,
      fbSubcode,
    );
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
