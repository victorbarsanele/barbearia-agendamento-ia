const NOME_VARIAVEL = 'VINCULO_AUTOMATICO_WHATSAPP_ENABLED';

export function getVinculoAutomaticoWhatsappEnabled(): boolean {
    const valor = process.env[NOME_VARIAVEL];
    if (valor === undefined || valor === 'false') {
        return false;
    }
    if (valor === 'true') {
        return true;
    }

    throw new Error(
        `${NOME_VARIAVEL} inválida: valor recebido "${valor}". Informe "true" ou "false".`,
    );
}

export function validarVinculoAutomaticoWhatsappConfig(): void {
    getVinculoAutomaticoWhatsappEnabled();
}
