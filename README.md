# Análise da Produção Skyline

Dashboards web para exibição em **TVs e monitores** da operação: Recebimento, Triagem, Produção (Diversas Marcas / iPhone) e CQE.

## Módulos

| Módulo | Arquivo | Dados |
|--------|---------|--------|
| Menu | `menu.html` | Hub principal |
| Recebimento | `recebimento.html` | API recebimento + filtro grupo 6151 |
| Triagem | `triagem.html` | API reparo — Data Triagem |
| Produção Diversas Marcas | `producao-diversas-marcas.html` | Status + tempo por colaborador |
| Produção iPhone | `producao-iphone.html` | Mesma lógica (filtro de usuários em breve) |
| Gestão de Produto | `gestao-produto.html` | Em construção |
| CQE | `cqe.html` | Aprovado / Reprovado por qualidade |
| CQE Gestão — Fluxo técnicos | `cqe-gestao.html?view=fluxo` | Recebidos x Finalizados x Acumulado por técnico (`skyline-fluxo-tecnico.js`) |

## Requisitos

- Navegador moderno (Chrome, Edge, Firefox)
- **Servidor HTTP** na rede (não abrir arquivos com `file://`)
- TVs/computador com acesso à internet para a API Skyline (`datalake.skyline.pro`)

## Rodar na rede (TVs)

### Opção 1 — Script (recomendado)

```bash
chmod +x start.sh
./start.sh 8080
```

### Opção 2 — Python

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

### Opção 3 — Node

```bash
npm run serve
```

Abra nas TVs:

```
http://IP-DO-SERVIDOR:8080/menu.html
```

Substitua `IP-DO-SERVIDOR` pelo IP da máquina que está rodando o servidor (ex.: `192.168.1.50`).

### Dica para TV / kiosk

1. Abra o endereço acima no navegador da TV
2. Pressione **F11** (ou modo tela cheia da TV)
3. Cada módulo tem filtro **Hoje** por padrão; use **Recarregar dados** para atualizar
4. Deixe o PC/servidor ligado e o comando `start.sh` rodando

## Link público (GitHub Pages)

Após ativar (passos abaixo), o dashboard fica em:

**https://essouzas21-sketch.github.io/Skyline-Dashboard/menu.html**

### Ativar (só na primeira vez)

1. Abra: https://github.com/essouzas21-sketch/Skyline-Dashboard/settings/pages
2. Em **Build and deployment** → **Source**, escolha **Deploy from a branch**
3. Em **Branch**, selecione **main** e pasta **/ (root)**
4. Clique em **Save**
5. Aguarde 2–5 minutos — o link verde aparece na mesma página

Não use GitHub Actions para este projeto; a publicação é direto da branch `main`.

> **CORS:** a API Skyline precisa aceitar requisições do domínio `github.io`. Se os dados não carregarem no link público, use o servidor local (`./start.sh`) na rede da empresa.

## Subir no GitHub

```bash
cd skyline-dashboard
git init
git add .
git commit -m "Dashboard produção Skyline para TVs"
git branch -M main
git remote add origin https://github.com/essouzas21-sketch/skyline-dashboard.git
git push -u origin main
```

> Para **TVs na rede interna**, clone + `./start.sh` em um PC sempre ligado. Para **acesso pela internet**, use o link do GitHub Pages acima.

## Estrutura

```
skyline-dashboard/
├── index.html              → redireciona para menu.html
├── menu.html
├── recebimento.html
├── triagem.html
├── producao-diversas-marcas.html
├── producao-iphone.html
├── gestao-produto.html
├── cqe.html
├── skyline-dash.js          → utilitários compartilhados
├── skyline-dash.css
├── skyline-producao.js      → lógica produção
├── modulo-base.css
├── start.sh
├── package.json
└── README.md
```

## Segregar usuários (Produção)

Edite `skyline-producao.js`:

```javascript
USER_FILTERS: {
  diversas: ["Nome 1", "Nome 2"],
  iphone: ["Nome 3", "Nome 4"]
}
```

`null` = exibe todos os colaboradores.

## CQE Gestão — Fluxo técnicos

Aba **Fluxo técnicos** em `cqe-gestao.html` (link direto: `cqe-gestao.html?view=fluxo`). Lógica em `skyline-fluxo-tecnico.js`.

| Indicador | Regra |
|-----------|-------|
| Iniciados | Reparos com `Iniciado_Reparo` no período |
| Finalizados | Reparos com `Fim do Reparo` no período (qualquer data de início) |
| Acumulado anterior | Reparos iniciados antes do período e ainda não finalizados no início dele |
| Acumulado atual | Acumulado anterior + Iniciados − Finalizados |
| % Finalização do dia | Iniciados e finalizados no mesmo dia ÷ Iniciados × 100 (0% a 100%) |
| Com o técnico agora | Reparos em aberto neste momento com o técnico (independe do período) |

Cada aparelho conta para um técnico só: quem está com ele agora (última pausa/retorno ou início) ou, se finalizado, quem finalizou.

Só entram os técnicos designados por posição de produção (PROD1 a PROD18), definidos em `SkylineFluxoTecnico.EQUIPE` no arquivo `skyline-fluxo-tecnico.js`. Para trocar alguém de posição, edite essa lista.

Filtros: Dia / Semana / Mês / Personalizado (a partir de uma data de referência, com atalho Hoje), técnico, modelo, marca, tipo e linha. A lógica fica em `skyline-fluxo-tecnico.js` (funções puras, sem DOM).
