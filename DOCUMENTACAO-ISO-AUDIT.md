# DOCUMENTAÇÃO DE SISTEMA — SKYLINE DASHBOARD (BI OPERACIONAL)

| Campo | Valor |
|-------|-------|
| **Código do documento** | SKY-BI-DOC-001 |
| **Título** | Documentação estruturada dos Dashboards de Análise da Produção |
| **Organização** | Skyline Mobile |
| **Sistema** | Skyline Dashboard (Análise da Produção) |
| **Versão do documento** | 1.0 |
| **Data de emissão** | 2026-07-13 |
| **Classificação** | Uso interno — Auditoria / Qualidade |
| **Normas de referência** | ISO 9001:2015 (informação documentada, controle de processo, monitoramento); alinhável a ISO/IEC 27001 (controle de acesso e integridade de dados) |
| **Ambiente de produção** | https://essouzas21-sketch.github.io/Skyline-Dashboard/menu.html |
| **Repositório** | GitHub — branch `main` (produção) / `homologacao` (homologação) |
| **Versão da aplicação** | Controlada por `version.json` (ex.: `20260701173423`) |

---

## 1. Objetivo do documento

Este documento descreve, de forma rastreável e auditável:

1. A **finalidade** e o **escopo** do sistema de dashboards BI da Skyline Mobile;
2. Os **processos operacionais** monitorados;
3. As **fontes de dados**, regras de cálculo e indicadores (KPIs);
4. Os **controles** de ambiente, versão, homologação e publicação;
5. As **limitações conhecidas** e o plano de melhoria (v2).

Destina-se a auditores internos/externos, qualidade, TI e gestores da operação de reparo.

---

## 2. Escopo do sistema

### 2.1 Incluído

- Painéis web de **monitoramento operacional** (TVs / monitores de chão de fábrica);
- Painéis de **gestão** (supervisão) com filtros, gráficos e detalhamento;
- Agregação consolidada dos módulos;
- Impressão de etiqueta de recebimento (busca por serial);
- Ambiente de **homologação** com fixtures locais;
- Publicação via **GitHub Pages** e/ou servidor HTTP interno.

### 2.2 Excluído (fora do escopo atual)

- Sistema ERP/WMS (Sankhya, Log Smart) — apenas **consumidos** via integração;
- Persistência histórica própria (datalake dedicado);
- Autenticação de usuários / perfis de acesso;
- Alteração de dados de origem (sistema é **somente leitura**);
- Módulo Trade-In / Agent USB (projeto separado).

---

## 3. Finalidade do sistema

O **Skyline Dashboard** é um sistema de **Business Intelligence operacional** que transforma dados de recebimento, triagem, gestão de peças, reparo e inspeção de qualidade (CQE) em indicadores visuais para:

| Público | Uso |
|---------|-----|
| Operação (TV / kiosk) | Acompanhamento em tempo quase real da produção e qualidade |
| Supervisão / Gestão | Análise com filtros, ranking, motivos de reprovação e custo/tempo |
| Qualidade | Taxa de aprovação CQE, meta e comparação histórica relativa |
| Direção / Auditoria | Evidência de monitoramento do processo produtivo |

**Princípio:** o dashboard **não altera** registros de origem; apenas **consulta, filtra, agrega e exibe**.

---

## 4. Visão do processo de negócio (mapa)

```
Recebimento (WMS)
        ↓
    Triagem
        ↓
Gestão de Peças (Sankhya)
        ↓
Reparo por técnico (Android / iPhone)
        ↓
Inspeção CQE (Aprovado / Reprovado)
        ↓
Consolidado gerencial
```

Cada etapa possui dashboard dedicado e regras de KPI documentadas nas seções 7–8.

---

## 5. Arquitetura técnica (visão de auditoria)

| Camada | Descrição | Evidência |
|--------|-----------|-----------|
| Apresentação | HTML/CSS/JavaScript (vanilla), Chart.js, JsBarcode | Arquivos `*.html`, `yardex-*.js/css` |
| Lógica de negócio (cliente) | Agregação, filtros de data, deduplicação CQE, status de produção | `yardex-dash.js`, `yardex-producao.js`, `yardex-producao-gestao.js`, `yardex-consolidado.js` |
| Cache | IndexedDB + memória (mitiga falha temporária da API) | Funções de cache em `yardex-dash.js` |
| Integração | Webhooks n8n (somente leitura) | Constantes `API_REPARO`, `API_RECEBIMENTO` |
| Homologação | Fixtures JSON locais | `data/homolog/`, `?homolog=1` |
| Publicação | GitHub Pages (branch `main`) | URL pública + `version.json` |
| Controle de versão de tela | Polling de `version.json` → reload automático nas TVs | `yardex-version.js` |

**Modelo de dados:** sem banco próprio. Os dados residem nos sistemas de origem; o dashboard consome payloads via HTTP.

---

## 6. Inventário de dashboards (catálogo)

### 6.1 Hub

| ID | Página | Função | Público |
|----|--------|--------|---------|
| D-00 | `menu.html` | Menu central de navegação | Todos |
| D-00a | `index.html` | Redirecionamento para o menu | — |

### 6.2 Operacionais (TV / chão)

| ID | Módulo | Página | Função principal |
|----|--------|--------|------------------|
| D-01 | Recebimento | `recebimento.html` | Volume recebido (grupo 6151), marcas, horário |
| D-02 | Etiqueta recebimento | `imprimir-recebimento.html` | Busca serial + etiqueta 9×3 cm |
| D-03 | Triagem | `triagem.html` | Volumes por colaborador / marca / hora |
| D-04 | Gestão de produto | `gestao-produto.html` | Peças requisitadas (Sankhya) |
| D-05 | Produção Android 1 | `producao-diversas-1.html` | Status e tempo — equipe Q1 |
| D-06 | Produção Android 2 | `producao-diversas-2.html` | Status e tempo — equipe Q2 |
| D-07 | Produção Android 3 | `producao-diversas-3.html` | Status e tempo — equipe Q3 |
| D-08 | Produção Android 4 | `producao-diversas-4.html` | Reservado (sem equipe ativa) |
| D-09 | Produção Android 5 | `producao-diversas-5.html` | Status e tempo — equipe Q5 |
| D-10 | Produção iPhone | `producao-iphone.html` | Status e tempo — equipe iPhone |
| D-11 | CQE (TV) | `cqe.html` | Qualidade com **nomes anonimizados** |
| D-12 | Consolidado | `consolidado.html` | Roll-up de todos os módulos |

### 6.3 Gestão (supervisão)

| ID | Módulo | Página | Função principal |
|----|--------|--------|------------------|
| D-20 | CQE Gestão | `cqe-gestao.html` | Mesmo CQE com **nomes reais** dos técnicos |
| D-21 | Android 1 Gestão | `producao-android1-gestao.html` | KPIs, filtros, gráficos, peças/tempo |
| D-22 | Android 2 Gestão | `producao-android2-gestao.html` | Idem |
| D-23 | Android 3 Gestão | `producao-android3-gestao.html` | Idem |
| D-24 | Android 5 Gestão | `producao-android5-gestao.html` | Idem |
| D-25 | iPhone Gestão | `producao-iphone-gestao.html` | Idem |

> **Controle de privacidade (TV):** o painel `cqe.html` mascara nomes de técnicos (ex.: Colab. A/B). O painel `cqe-gestao.html` exibe identificação completa, destinado a supervisão.

---

## 7. Fontes de dados e integridade

### 7.1 Fontes oficiais

| Código | Tipo | Endpoint (integração) | Conteúdo típico | Consumidores |
|--------|------|----------------------|-----------------|--------------|
| SRC-REP | Webhook n8n — Reparo | `automacao.skylinemobile.com.br/webhook/…` (reparo) | Triagem, reparo, peças, CQE | Triagem, Produção, Gestão, CQE, Consolidado |
| SRC-REC | Webhook n8n — Recebimento | `automacao.skylinemobile.com.br/webhook/…` (recebimento) | HU, grupo, data recebimento, marca | Recebimento, Consolidado, Etiqueta |

### 7.2 Controles de integridade aplicados no dashboard

| Controle | Descrição | Onde |
|----------|-----------|------|
| Filtro de grupo | Recebimento restrito ao **grupo 6151** | `passesRecebimentoRaw` |
| Normalização de payload | Aceita array ou objeto aninhado | `normalizeRows` |
| Deduplicação CQE | Chave `id + dia + decisão`; exclusão de motivo “teste” | `processCqeRows` |
| Campos de data CQE | Aprovado → data Sankhya; Reprovado → Fim do Reparo (conforme regra vigente) | `yardex-dash.js` |
| Cache com fallback | Em falha de API, usa cache recente (stale) | `fetchWebhook` |
| Homologação isolada | Ambiente local não altera produção | `?homolog=1` / fixtures |
| Versionamento de tela | Nova versão força reload nas TVs | `version.json` |

### 7.3 Ambientes

| Ambiente | Como acessar | Fonte de dados | Uso |
|----------|--------------|----------------|-----|
| **Produção** | GitHub Pages ou `?prod=1` | Webhooks ao vivo | TVs e gestão |
| **Homologação** | `./start-homolog.sh` ou `?homolog=1` | `data/homolog/*.json` | Testes sem impacto operacional |
| **Sync de fixtures** | `scripts/sync-homolog-data.py` | Cópia pontual da API → JSON local | Evidência de amostra / regressão |

---

## 8. Definição de indicadores (KPIs) — referência

> Valores exatos dependem do filtro de período selecionado no painel (padrão: **Hoje**).

### 8.1 Recebimento

| Indicador | Definição operacional |
|-----------|------------------------|
| Recebidos no período | Contagem de registros do grupo 6151 no intervalo de datas |
| Recebidos hoje / mês | Mesma regra com janela diária / mensal |
| Distribuição por marca / hora | Agregações para gráficos e heatmap |

### 8.2 Triagem

| Indicador | Definição operacional |
|-----------|------------------------|
| Triagens no período | Registros com `Data Triagem` válida; operação em reparo / gestão de peças |
| Por colaborador / marca / hora | Agregações com deduplicação por id |

### 8.3 Gestão de produto (peças)

| Indicador | Definição operacional |
|-----------|------------------------|
| Peças / aparelhos | Contagens a partir de requisições Sankhya (`produto_requisitado_id`) |
| Data de referência | `DATA_PEDIDO_SANKHYA` (com fallback documentado no código) |

### 8.4 Produção (Android / iPhone)

| Indicador | Definição operacional |
|-----------|------------------------|
| Finalizado | Aparelho com fluxo de reparo concluído no período |
| Em andamento | Reparo iniciado e não finalizado |
| Pausado | Estado de pausa conforme timestamps do payload |
| Tempo trabalhado | Cálculo em horário comercial (regra no código de produção) |
| Segregação por equipe | Filtro `USER_FILTERS` por painel (Q1–Q5 / iPhone) |

**Equipes cadastradas (referência operacional v1):**

| Painel | Colaboradores |
|--------|---------------|
| Android 1 | Karoline, Thaís |
| Android 2 | Viviane, Michele |
| Android 3 | Keytman, Fernanda |
| Android 4 | Reservado (sem usuários) |
| Android 5 | Claudia |
| iPhone | Noemi, Fran |

### 8.5 CQE (qualidade)

| Indicador | Definição operacional |
|-----------|------------------------|
| Aprovados / Reprovados / Total | Contagens após `processCqeRows` |
| Taxa de aprovação | Aprovados ÷ Total inspecionado |
| Meta | Referência **98%** (exibida no painel) |
| Comparativos | vs ontem / 7 dias / 30 dias |
| Motivos de reprovação | Funil / ranking; no painel TV operacional, motivo pode ser condensado (1ª palavra) |

### 8.6 Consolidado

Agrega os KPIs dos módulos acima em uma única tela. **Regra de governança:** qualquer alteração de KPI em dashboard individual deve ser refletida em `yardex-consolidado.js` (checklist interno de sincronização).

---

## 9. Controle de mudanças e publicação

| Etapa | Atividade | Responsável típico | Evidência |
|-------|-----------|--------------------|-----------|
| 1 | Alteração em código (HTML/JS) | Desenvolvimento | Commit Git |
| 2 | Teste em homologação (`?homolog=1`) | Desenvolvimento / Qualidade | Prints / checklist |
| 3 | Validação de paridade com Consolidado | Desenvolvimento | Checklist consolidado-sync |
| 4 | Commit + push na branch `main` | Desenvolvimento | Histórico GitHub |
| 5 | Bump de `version.json` | Desenvolvimento | `npm run bump-version` / script |
| 6 | TVs recarregam automaticamente | Sistema | `yardex-version.js` |

**Rastreabilidade:** o histórico Git constitui o registro de alterações do software.

---

## 10. Papéis e responsabilidades (RACI simplificado)

| Atividade | Operação | Supervisão | TI / Dev | Qualidade |
|-----------|----------|------------|----------|-----------|
| Visualizar TVs | R | C | I | I |
| Analisar CQE / produção gestão | C | R | I | C |
| Manter regras de KPI / código | I | C | R | C |
| Homologar alterações | I | C | R | A/C |
| Auditoria / evidências | I | C | C | R |
| Disponibilidade da API (n8n) | I | I | R* | I |

\*Integração n8n / automação — responsabilidade compartilhada com área de automação/TI.

**Legenda:** R = Responsável · A = Aprova · C = Consultado · I = Informado

---

## 11. Segurança da informação (controles atuais)

| Tema | Situação atual | Risco residual | Mitigação recomendada (v2) |
|------|----------------|----------------|----------------------------|
| Autenticação | Não há login | Acesso aberto a quem tiver a URL | Login / perfil (TV vs gestão) |
| Exposição de webhook | URL de integração no frontend | Uso indevido da API | BFF / proxy autenticado |
| Dados pessoais | Nomes de colaboradores em painéis de gestão | Exposição em TV compartilhada | Manter anonimização na TV (já implementada no CQE TV) |
| Integridade | Somente leitura no dashboard | Baixo (não grava origem) | Manter princípio read-only |
| Disponibilidade | Dependência de webhook + GitHub Pages | Indisponibilidade / lentidão (~14 MB) | Cache + BFF agregador |
| Homologação | Isolada da produção | Baixo | Manter fluxo obrigatório antes de publicar |

---

## 12. Monitoramento operacional e continuidade

| Item | Prática atual |
|------|---------------|
| Atualização de dados | Refresh automático escalonado (~30s entre páginas do ciclo) |
| Botão “Recarregar” | Disponível nos painéis |
| Falha de API | Exibe cache recente quando disponível |
| Deploy em TVs | Reload forçado via `version.json` |
| Contingência | Servidor interno (`./start.sh`) se GitHub Pages/CORS falhar |

---

## 13. Limitações conhecidas (transparência para auditoria)

1. Ausência de backend próprio e de autenticação;
2. Payload de reparo volumoso (~14 MB) — impacto de performance;
3. Regras de KPI distribuídas em JS — risco de divergência se consolidado não for sincronizado;
4. Painel Android 4 reservado (sem equipe);
5. Histórico analítico limitado ao que a API retorna (sem datalake próprio);
6. Documentação README técnica parcialmente desatualizada em relação ao inventário completo (este documento prevalece para auditoria).

---

## 14. Plano de melhoria (v2) — referência

| Prioridade | Melhoria | Objetivo de controle |
|------------|----------|----------------------|
| Alta | API intermediária (BFF) + payload reduzido | Disponibilidade / desempenho |
| Alta | KPIs centralizados + testes de paridade | Integridade / consistência |
| Média | Histórico diário persistido | Rastreabilidade temporal |
| Média | Alertas de meta (CQE / produção) | Monitoramento proativo |
| Baixa | Autenticação por perfil | Confidencialidade |
| Baixa | Camada BI (Metabase/Grafana) | Análise avançada |

---

## 15. Evidências sugeridas para auditoria

| Evidência | Como obter |
|-----------|------------|
| Inventário de dashboards | Seção 6 deste documento + `menu.html` |
| Código-fonte versionado | Repositório GitHub |
| Versão em produção | `version.json` + URL pública |
| Homologação | `data/homolog/manifest.json` (synced_at) + prints `?homolog=1` |
| Regras CQE / produção | `yardex-dash.js` / `yardex-producao.js` |
| Publicação | Histórico de commits / GitHub Pages settings |
| Uso operacional | Fotos/prints das TVs e painéis de gestão |
| Treinamento / acesso | Registro interno de quem opera TVs e gestão |

---

## 16. Glossário

| Termo | Significado |
|-------|-------------|
| **CQE** | Controle / inspeção de qualidade pós-reparo |
| **HU** | Handling Unit / unidade de manuseio no recebimento |
| **KPI** | Indicador-chave de desempenho |
| **n8n** | Plataforma de automação que expõe os webhooks de dados |
| **Sankhya** | ERP utilizado para pedidos/peças |
| **Homologação** | Ambiente de teste com dados espelhados/fixtures |
| **BFF** | Backend for Frontend — camada intermediária proposta na v2 |

---

## 17. Controle de revisões do documento

| Versão | Data | Autor | Descrição |
|--------|------|-------|-----------|
| 1.0 | 2026-07-13 | Equipe Skyline / TI | Emissão inicial para auditoria ISO |

---

## 18. Aprovações

| Papel | Nome | Assinatura | Data |
|-------|------|------------|------|
| Elaboração | | | |
| Revisão Técnica (TI) | | | |
| Aprovação Qualidade | | | |
| Aprovação Gestão Operacional | | | |

---

*Documento gerado para fins de auditoria e gestão da qualidade. Em caso de conflito entre README técnico e este documento, prevalece o **SKY-BI-DOC-001** para escopo, inventário e controles, até nova revisão formal.*
