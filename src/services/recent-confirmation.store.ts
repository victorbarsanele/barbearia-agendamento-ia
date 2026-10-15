export const RECENT_CONFIRMATION_TTL_MS = 5 * 60 * 1000;
export const RECENT_CONFIRMATION_MAX_ENTRIES = 1_000;

export interface RecentConfirmation {
    servicoNome: string;
    diaSemana: string;
    data: string;
    hora: string;
    mensagemConfirmacaoId: string;
    expiraEm: Date;
}

export type NovaRecentConfirmation = Omit<RecentConfirmation, 'expiraEm'>;

interface RecentConfirmationStoreOptions {
    maxEntries?: number;
    now?: () => Date;
}

export class RecentConfirmationStore {
    private readonly registros = new Map<string, RecentConfirmation>();
    private readonly maxEntries: number;
    private readonly now: () => Date;

    constructor({
        maxEntries = RECENT_CONFIRMATION_MAX_ENTRIES,
        now = () => new Date(),
    }: RecentConfirmationStoreOptions = {}) {
        if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
            throw new RangeError('maxEntries deve ser um inteiro positivo');
        }

        this.maxEntries = maxEntries;
        this.now = now;
    }

    registrar(
        telefoneSessao: string,
        confirmacao: NovaRecentConfirmation,
    ): RecentConfirmation {
        this.limparExpirados();
        this.registros.delete(telefoneSessao);
        while (this.registros.size >= this.maxEntries) {
            const maisAntigo = this.registros.keys().next().value;
            if (maisAntigo === undefined) {
                break;
            }
            this.registros.delete(maisAntigo);
        }

        const registrado: RecentConfirmation = {
            ...confirmacao,
            expiraEm: new Date(
                this.now().getTime() + RECENT_CONFIRMATION_TTL_MS,
            ),
        };
        this.registros.set(telefoneSessao, registrado);
        return this.clonar(registrado);
    }

    obterValido(telefoneSessao: string): RecentConfirmation | null {
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
            if (registro.expiraEm.getTime() <= agora) {
                this.registros.delete(telefone);
            }
        }
    }

    private clonar(registro: RecentConfirmation): RecentConfirmation {
        return { ...registro, expiraEm: new Date(registro.expiraEm) };
    }
}

const recentConfirmationStore = new RecentConfirmationStore();

export function registrar(
    telefoneSessao: string,
    confirmacao: NovaRecentConfirmation,
): RecentConfirmation {
    return recentConfirmationStore.registrar(telefoneSessao, confirmacao);
}

export function obterValido(
    telefoneSessao: string,
): RecentConfirmation | null {
    return recentConfirmationStore.obterValido(telefoneSessao);
}

export function limpar(telefoneSessao?: string): void {
    recentConfirmationStore.limpar(telefoneSessao);
}

export function reset(): void {
    recentConfirmationStore.reset();
}
