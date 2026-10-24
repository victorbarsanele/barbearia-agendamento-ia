import { useEffect, useState } from 'react';
import { buscarConfiguracaoAgendamento } from '../services/configuracaoAgendamento.service';
import {
    FALLBACK_MIN_ANTECEDENCIA_MINUTOS,
    normalizarMinAntecedencia,
} from '../utils/antecedenciaAgendamento';

export function useMinAntecedenciaMinutos(): number {
    const [minutos, setMinutos] = useState(FALLBACK_MIN_ANTECEDENCIA_MINUTOS);

    useEffect(() => {
        let ativo = true;

        void buscarConfiguracaoAgendamento()
            .then((configuracao) => {
                if (ativo) {
                    setMinutos(
                        normalizarMinAntecedencia(
                            configuracao?.minAntecedenciaMinutos,
                        ),
                    );
                }
            })
            .catch(() => {
                if (ativo) {
                    setMinutos(FALLBACK_MIN_ANTECEDENCIA_MINUTOS);
                }
            });

        return () => {
            ativo = false;
        };
    }, []);

    return minutos;
}
