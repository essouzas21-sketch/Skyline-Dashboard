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

## Requisitos

- Navegador moderno (Chrome, Edge, Firefox)
- **Servidor HTTP** na rede (não abrir arquivos com `file://`)
- TVs/computador com acesso à internet para a API Yardex (`datalake.yardex.pro`)

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

## Subir no GitHub

```bash
cd skyline-dashboard
git init
git add .
git commit -m "Dashboard produção Skyline para TVs"
git branch -M main
git remote add origin https://github.com/SUA-ORG/skyline-dashboard.git
git push -u origin main
```

> O Git guarda os arquivos. Para as **TVs** continuarem funcionando, ainda é necessário um servidor HTTP na rede interna (clone + `./start.sh` em um PC sempre ligado).

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
├── yardex-dash.js          → utilitários compartilhados
├── yardex-dash.css
├── yardex-producao.js      → lógica produção
├── modulo-base.css
├── start.sh
├── package.json
└── README.md
```

## Segregar usuários (Produção)

Edite `yardex-producao.js`:

```javascript
USER_FILTERS: {
  diversas: ["Nome 1", "Nome 2"],
  iphone: ["Nome 3", "Nome 4"]
}
```

`null` = exibe todos os colaboradores.
