export const DEFAULT_RESUMO_ENVIADO_TTL_MS = 10 * 60 * 1000;
export const RESUMO_ENVIADO_MAX_ENTRIES = 1_000;

export interface ResumoEnviado {
    mensagemCriacaoId: string;
    resumo: string;
    registradoEm: Date;
}

export interface NovoResumoEnviado {
    mensagemCriacaoId: string;
    resumo: string;
}

interface ResumoEnviadoStoreOptions {
    ttlMs?: number;
    maxEntries?: number;
    now?: () => Date;
}

export class ResumoEnviadoStore {
    private readonly registros = new Map<string, ResumoEnviado>();
    private readonly ttlMs: number;
    private readonly maxEntries: number;
    private readonly now: () => Date;

    constructor({
        ttlMs = DEFAULT_RESUMO_ENVIADO_TTL_MS,
        maxEntries = RESUMO_ENVIADO_MAX_ENTRIES,
        now = () => new Date(),
    }: ResumoEnviadoStoreOptions = {}) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new RangeError('ttlMs deve ser um número positivo finito');
        }
        if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
            throw new RangeError('maxEntries deve ser um inteiro positivo');
        }

        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.now = now;
    }

    registrar(
        telefoneSessao: string,
        resumoEnviado: NovoResumoEnviado,
    ): ResumoEnviado {
        this.limparExpirados();
        this.registros.delete(telefoneSessao);
        while (this.registros.size >= this.maxEntries) {
            const maisAntigo = this.registros.keys().next().value;
            if (maisAntigo === undefined) {
                break;
            }
            this.registros.delete(maisAntigo);
        }

        const registrado: ResumoEnviado = {
            ...resumoEnviado,
            registradoEm: new Date(this.now()),
        };
        this.registros.set(telefoneSessao, registrado);
        return this.clonar(registrado);
    }

    obterValido(telefoneSessao: string): ResumoEnviado | null {
        this.limparExpirados();
        const registro = this.registros.get(telefoneSessao);
        return registro ? this.clonar(registro) : null;
    }

    limpar(telefoneSessao?: string): void {
        if (telefoneSessao === undefined) {
            this.registros.clear();
            return;
        }
        this.registros.delete(telefoneSessao);
    }

    reset(): void {
        this.registros.clear();
    }

    private limparExpirados(): void {
        const agora = this.now().getTime();
        for (const [telefone, registro] of this.registros) {
            if (agora - registro.registradoEm.getTime() >= this.ttlMs) {
                this.registros.delete(telefone);
            }
        }
    }

    private clonar(registro: ResumoEnviado): ResumoEnviado {
        return { ...registro, registradoEm: new Date(registro.registradoEm) };
    }
}

// Store vale por instância; sem marcador, fluxo cai no LLM. Integridade depende do consumo atômico do rascunho, exclusion constraint e trava "você já tem agendamento nesse horário".
const resumoEnviadoStore = new ResumoEnviadoStore();

export function registrar(
    telefoneSessao: string,
    resumo: NovoResumoEnviado,
): ResumoEnviado {
    return resumoEnviadoStore.registrar(telefoneSessao, resumo);
}

export function obterValido(telefoneSessao: string): ResumoEnviado | null {
    return resumoEnviadoStore.obterValido(telefoneSessao);
}

export function limpar(telefoneSessao?: string): void {
    resumoEnviadoStore.limpar(telefoneSessao);
}

export function reset(): void {
    resumoEnviadoStore.reset();
}
