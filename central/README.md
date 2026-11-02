# Central de Atendimento AR

Painel para os agentes comerciais atenderem sua carteira de **imobiliárias** e **corretores autônomos**:
agenda de visitas com envio ao Google Agenda (com lembretes), registro de contatos e retornos.

- `index.src.html` — código-fonte da página (artefato do Claude).
- `logo.b64` — logo da AR embutido na página.
- `build.py` — gera `index.html` (fonte + logo). Rode `python3 central/build.py` após editar.

## Acesso
Cada agente entra com a própria conta do Claude. O gestor compartilha a página como **Colaborador**;
o agente abre o link e clica em **Entrar na central**.

## Dados (banco do artefato)
| Caminho | Quem lê / escreve |
|---|---|
| `equipe/<agente>` | o próprio agente; o gestor (dono) vê todos |
| `carteiras/<agente>/parceiros/*` | só o agente dono e o gestor/editores |
| `carteiras/<agente>/visitas/*` | só o agente dono e o gestor/editores |
| `base/*` | só gestor/editores — parceiros importados aguardando distribuição |

## Importação da planilha
CSV com colunas `nome, tipo, telefone, email, cidade, creci, responsavel, agente`.
A coluna `agente` (e-mail ou nome) permite distribuir automaticamente na aba Equipe.
