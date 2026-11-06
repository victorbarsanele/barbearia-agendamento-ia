import prisma from '../lib/prisma';

export async function mensagemFoiProcessada(
    provider: string,
    messageId: string,
): Promise<boolean> {
    const message = await prisma.mensagemWhatsAppProcessada.findFirst({
        where: { provedor: provider, idMensagem: messageId },
        select: { idMensagem: true },
    });
    return message !== null;
}

export async function registrarMensagemProcessada(
    provider: string,
    messageId: string,
): Promise<boolean> {
    const result = await prisma.mensagemWhatsAppProcessada.createMany({
        data: [{ provedor: provider, idMensagem: messageId }],
        skipDuplicates: true,
    });

    return result.count === 1;
}
