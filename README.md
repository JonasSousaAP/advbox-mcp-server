# 📚 Documentação MCP Advbox Server

**Versão:** 2.2.0 (Hardened)  
**Última atualização:** 05 de Janeiro de 2026  
**Autor:** Jonas Sousa

---

## 📑 Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Instalação](#3-instalação)
4. [Configuração](#4-configuração)
5. [Autenticação](#5-autenticação)
6. [Endpoints HTTP](#6-endpoints-http)
7. [Tools Disponíveis](#7-tools-disponíveis)
8. [Exemplos de Uso](#8-exemplos-de-uso)
9. [Segurança](#9-segurança)
10. [Integração com n8n](#10-integração-com-n8n)
11. [Monitoramento](#11-monitoramento)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Visão Geral

### O que é o MCP Advbox?

O **MCP Advbox Server** é um servidor que implementa o protocolo **Model Context Protocol (MCP)** para integração com a API do Advbox, sistema de gestão jurídica. Ele permite que agentes de IA (como Claude) interajam diretamente com dados de clientes, processos, tarefas e transações financeiras do escritório.

### Funcionalidades Principais

- ✅ **19 Tools** para operações CRUD completas
- ✅ **Autenticação segura** via Bearer Token
- ✅ **Rate Limiting** para proteção contra abuso
- ✅ **SSE (Server-Sent Events)** para comunicação em tempo real
- ✅ **Validação de entrada** em todos os parâmetros
- ✅ **Headers de segurança** (HSTS, CSP, X-Frame-Options)

### Casos de Uso

| Caso de Uso | Descrição |
|-------------|-----------|
| Consulta de clientes | Buscar informações de clientes por nome, telefone, email |
| Gestão de processos | Criar, atualizar e consultar processos jurídicos |
| Controle financeiro | Listar transações, receitas e despesas |
| Agenda de compromissos | Criar e listar tarefas e compromissos |
| Relatórios de equipe | Consultar pontuação e recompensas da equipe |

---

## 2. Arquitetura

### Diagrama

```
┌─────────────────┐     HTTPS/SSE      ┌──────────────────┐     HTTPS      ┌─────────────────┐
│   Claude / n8n  │ ◄────────────────► │  MCP Advbox API  │ ◄────────────► │   Advbox API    │
│                 │    Bearer Token    │   (Port 3847)    │   API Token    │   (v1)          │
└─────────────────┘                    └──────────────────┘                └─────────────────┘
```

### Stack Tecnológica

| Componente | Tecnologia |
|------------|------------|
| Runtime | Node.js 20 Alpine |
| Linguagem | TypeScript |
| Protocolo | MCP (Model Context Protocol) |
| Transporte | HTTP + SSE |
| Container | Docker |
| Proxy | Traefik |
| TLS | Let's Encrypt |

### Estrutura de Arquivos

```
/opt/stacks/advbox-mcp-server/
├── src/
│   └── http-server.ts      # Código principal
├── dist/
│   └── http-server.js      # Código compilado
├── docs/
│   └── README.md           # Esta documentação
├── docker-compose.yml
├── Dockerfile.http
├── package.json
├── tsconfig.json
└── .env
```

---

## 3. Instalação

### Pré-requisitos

- Docker 24.0+
- Docker Compose v2
- Rede Docker `proxy` configurada
- Traefik com Let's Encrypt

### Passo a Passo

```bash
# 1. Criar estrutura
mkdir -p /opt/stacks/advbox-mcp-server/src
cd /opt/stacks/advbox-mcp-server

# 2. Criar .env
cat > .env << EOF
ADVBOX_API_TOKEN=seu_token_advbox
ADVBOX_BASE_URL=https://app.advbox.com.br/api/v1
MCP_TOKEN=$(openssl rand -hex 32)
ALLOWED_ORIGINS=https://seu-dominio.com
EOF

# 3. Build e Deploy
docker compose build --no-cache advbox-api
docker compose up -d advbox-api

# 4. Verificar
curl http://localhost:3847/health
```

---

## 4. Configuração

### Variáveis de Ambiente

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `ADVBOX_API_TOKEN` | ✅ | Token de acesso à API Advbox |
| `ADVBOX_BASE_URL` | ❌ | URL base da API (default: https://app.advbox.com.br/api/v1) |
| `MCP_TOKEN` | ✅ | Token de autenticação do MCP |
| `ALLOWED_ORIGINS` | ❌ | Domínios permitidos (CORS) |
| `PORT` | ❌ | Porta interna (default: 3000) |

### Limites de Segurança

| Parâmetro | Valor | Descrição |
|-----------|-------|-----------|
| `MAX_BODY_SIZE` | 1 MB | Tamanho máximo do body |
| `RATE_LIMIT_MAX` | 100 req/min | Requests por IP |
| `MAX_SSE_CONNECTIONS` | 100 | Conexões SSE simultâneas |
| `MAX_SSE_PER_IP` | 5 | Conexões SSE por IP |
| `SSE_TIMEOUT` | 1 hora | Timeout de conexão SSE |

---

## 5. Autenticação

### Método

Bearer Token no header `Authorization`.

### Header

```http
Authorization: Bearer <MCP_TOKEN>
```

### Exemplo

```bash
curl -H "Authorization: Bearer <TOKEN>" https://<SEU_DOMINIO>/tools
```

### Erros

| Status | Resposta | Causa |
|--------|----------|-------|
| 401 | `{"error":"Unauthorized"}` | Token inválido |
| 429 | `{"error":"Too Many Requests"}` | Rate limit |

---

## 6. Endpoints HTTP

| Método | Endpoint | Auth | Descrição |
|--------|----------|------|-----------|
| GET | `/health` | ❌ | Health check |
| GET | `/sse` | ✅ | Conexão SSE (MCP) |
| POST | `/message` | ✅ | Mensagem MCP |
| GET | `/tools` | ✅ | Listar tools |
| POST | `/execute` | ✅ | Executar tool |

### GET /health

```bash
curl https://<SEU_DOMINIO>/health
```

```json
{"status":"healthy","version":"2.2.0","tools":19,"sse":0}
```

### POST /execute

```bash
curl -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"tool":"list_customers","arguments":{"limit":5}}' \
  https://<SEU_DOMINIO>/execute
```

---

## 7. Tools Disponíveis

### Resumo (19 tools)

| Categoria | Tools | Quantidade |
|-----------|-------|------------|
| Customers | list, get, search, create | 4 |
| Lawsuits | list, get, search, create, update | 5 |
| Transactions | list, get | 2 |
| Tasks | list, create | 2 |
| Settings | get_settings, get_users, get_origins, get_stages, get_type_lawsuits | 5 |
| Rewards | get_users_rewards | 1 |


### 7.1 Customers (Clientes)

#### list_customers
Lista e busca clientes com filtros.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `name` | string | ❌ | Nome do cliente (busca parcial) |
| `phone` | string | ❌ | Telefone |
| `email` | string | ❌ | Email |
| `city` | string | ❌ | Cidade |
| `limit` | number | ❌ | Máximo de resultados (default: 100, max: 500) |
| `offset` | number | ❌ | Pular resultados (paginação) |

**Exemplo:**
```json
{"tool":"list_customers","arguments":{"name":"Silva","limit":10}}
```

#### get_customer
Obtém detalhes de um cliente pelo ID.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `customer_id` | number | ✅ | ID do cliente |

**Exemplo:**
```json
{"tool":"get_customer","arguments":{"customer_id":12345}}
```

#### search_customers
Busca clientes por nome.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `query` | string | ✅* | Termo de busca |
| `name` | string | ✅* | Alternativa ao query |

#### create_customer
Cria um novo cliente.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `users_id` | number | ✅ | ID do usuário criando |
| `customers_origins_id` | number | ✅ | ID da origem do cliente |
| `name` | string | ✅ | Nome do cliente |
| `email` | string | ❌ | Email |
| `document` | string | ❌ | CPF/CNPJ |
| `identification` | string | ❌ | RG |
| `phone` | string | ❌ | Telefone |
| `birthdate` | string | ❌ | Data nascimento (YYYY-MM-DD) |

**Exemplo:**
```json
{
  "tool": "create_customer",
  "arguments": {
    "users_id": 1,
    "customers_origins_id": 2,
    "name": "João da Silva",
    "email": "joao@email.com",
    "phone": "85999999999"
  }
}
```

---

### 7.2 Lawsuits (Processos)

#### list_lawsuits
Lista processos com filtros.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `name` | string | ❌ | Nome da pasta/cliente |
| `process_number` | string | ❌ | Número do processo |
| `customer_id` | number | ❌ | ID do cliente |
| `responsible_id` | number | ❌ | ID do responsável |
| `group_id` | number | ❌ | ID do grupo/área |
| `limit` | number | ❌ | Máximo de resultados |
| `offset` | number | ❌ | Pular resultados |

#### get_lawsuit
Obtém detalhes de um processo.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `lawsuit_id` | number | ✅ | ID do processo |

#### search_lawsuits
Busca processos por nome/pasta.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `query` | string | ✅* | Termo de busca |
| `name` | string | ✅* | Alternativa |

#### create_lawsuit
Cria um novo processo.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `users_id` | number | ✅ | ID do usuário criando |
| `customers_id` | array[number] | ✅ | IDs dos clientes |
| `stages_id` | number | ✅ | ID do estágio |
| `type_lawsuits_id` | number | ✅ | ID do tipo de processo |
| `process_number` | string | ❌ | Número do processo |
| `protocol_number` | string | ❌ | Número do protocolo |
| `folder` | string | ❌ | Nome da pasta |
| `date` | string | ❌ | Data (YYYY-MM-DD) |
| `notes` | string | ❌ | Observações |

**Exemplo:**
```json
{
  "tool": "create_lawsuit",
  "arguments": {
    "users_id": 1,
    "customers_id": [123, 456],
    "stages_id": 5,
    "type_lawsuits_id": 10,
    "folder": "Silva vs Estado",
    "process_number": "0001234-56.2026.8.06.0001"
  }
}
```

#### update_lawsuit
Atualiza um processo existente.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `lawsuit_id` | number | ✅ | ID do processo |
| `stages_id` | number | ❌ | Novo estágio |
| `type_lawsuits_id` | number | ❌ | Novo tipo |
| `process_number` | string | ❌ | Número do processo |
| `folder` | string | ❌ | Nome da pasta |
| `notes` | string | ❌ | Observações |

---

### 7.3 Transactions (Transações)

#### list_transactions
Lista transações financeiras.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `date_payment_start` | string | ❌ | Data pagamento início (YYYY-MM-DD) |
| `date_payment_end` | string | ❌ | Data pagamento fim |
| `date_due_start` | string | ❌ | Data vencimento início |
| `date_due_end` | string | ❌ | Data vencimento fim |
| `lawsuit_id` | number | ❌ | Filtrar por processo |
| `limit` | number | ❌ | Máximo de resultados |
| `offset` | number | ❌ | Pular resultados |

**Exemplo:**
```json
{
  "tool": "list_transactions",
  "arguments": {
    "date_payment_start": "2026-01-01",
    "date_payment_end": "2026-01-31"
  }
}
```

#### get_transaction
Obtém detalhes de uma transação.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `transaction_id` | number | ✅ | ID da transação |

---

### 7.4 Tasks (Tarefas)

#### list_tasks
Lista tarefas e compromissos.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `date_start` | string | ❌ | Data início (YYYY-MM-DD) |
| `date_end` | string | ❌ | Data fim |
| `user_id` | number | ❌ | Filtrar por usuário |
| `lawsuit_id` | number | ❌ | Filtrar por processo |
| `task_id` | number | ❌ | Filtrar por tipo de tarefa |
| `limit` | number | ❌ | Máximo de resultados |
| `offset` | number | ❌ | Pular resultados |

#### create_task
Cria uma nova tarefa/compromisso.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `from` | number | ✅ | ID do usuário criando |
| `guests` | array[number] | ✅ | IDs dos convidados |
| `tasks_id` | number | ✅ | ID do tipo de tarefa |
| `lawsuits_id` | number | ✅ | ID do processo |
| `start_date` | string | ✅ | Data início (YYYY-MM-DD) |
| `start_time` | string | ❌ | Hora início (HH:MM) |
| `end_date` | string | ❌ | Data fim |
| `end_time` | string | ❌ | Hora fim |
| `date_deadline` | string | ❌ | Prazo |
| `comments` | string | ❌ | Comentários |
| `local` | string | ❌ | Local |
| `urgent` | boolean | ❌ | Urgente |
| `important` | boolean | ❌ | Importante |

**Exemplo:**
```json
{
  "tool": "create_task",
  "arguments": {
    "from": 1,
    "guests": [2, 3],
    "tasks_id": 5,
    "lawsuits_id": 100,
    "start_date": "2026-01-10",
    "start_time": "14:00",
    "comments": "Reunião com cliente",
    "urgent": true
  }
}
```

---

### 7.5 Settings (Configurações)

#### get_settings
Obtém todas as configurações do sistema (users, stages, types, origins).

#### get_users
Lista usuários/colaboradores.

#### get_origins
Lista origens de clientes. Use para obter `customers_origins_id`.

#### get_stages
Lista estágios de processos. Use para obter `stages_id`.

#### get_type_lawsuits
Lista tipos de processos. Use para obter `type_lawsuits_id`.

---

### 7.6 Rewards (Recompensas)

#### get_users_rewards
Obtém pontuação e recompensas da equipe.

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `date` | string | ❌ | Data limite (YYYY-MM-DD) |

**Exemplo:**
```json
{"tool":"get_users_rewards","arguments":{"date":"2026-01-05"}}
```

---

## 8. Exemplos de Uso

### 8.1 Fluxo MCP Completo (SSE)

```javascript
// 1. Conectar ao SSE
const eventSource = new EventSource('https://<SEU_DOMINIO>/sse', {
  headers: { 'Authorization': 'Bearer <TOKEN>' }
});

let messageEndpoint = '';

// 2. Receber endpoint para mensagens
eventSource.addEventListener('endpoint', (e) => {
  messageEndpoint = e.data;
  console.log('Endpoint:', messageEndpoint);
});

// 3. Receber respostas
eventSource.addEventListener('message', (e) => {
  const response = JSON.parse(e.data);
  console.log('Response:', response);
});

// 4. Enviar requisição MCP
fetch(messageEndpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <TOKEN>'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'list_customers',
      arguments: { limit: 5 }
    }
  })
});
```

### 8.2 Execução Direta (REST)

```bash
# Listar clientes
curl -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"tool":"list_customers","arguments":{"name":"Silva","limit":10}}' \
  https://<SEU_DOMINIO>/execute

# Buscar processo
curl -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"tool":"get_lawsuit","arguments":{"lawsuit_id":12345}}' \
  https://<SEU_DOMINIO>/execute

# Criar tarefa
curl -X POST \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "create_task",
    "arguments": {
      "from": 1,
      "guests": [1],
      "tasks_id": 5,
      "lawsuits_id": 100,
      "start_date": "2026-01-10",
      "comments": "Audiência"
    }
  }' \
  https://<SEU_DOMINIO>/execute
```

### 8.3 Paginação

```bash
# Página 1 (primeiros 100)
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  -d '{"tool":"list_customers","arguments":{"limit":100,"offset":0}}' \
  https://<SEU_DOMINIO>/execute

# Página 2 (próximos 100)
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  -d '{"tool":"list_customers","arguments":{"limit":100,"offset":100}}' \
  https://<SEU_DOMINIO>/execute
```

---

## 9. Segurança

### 9.1 Controles Implementados

| Controle | Descrição | CWE Mitigado |
|----------|-----------|---------------|
| **Timing-safe Auth** | Comparação de tokens resistente a timing attacks | CWE-208 |
| **Rate Limiting** | 100 req/min por IP | CWE-770 |
| **Input Validation** | Sanitização de todos os parâmetros | CWE-20 |
| **Body Size Limit** | Máximo 1MB | CWE-400 |
| **SSE Limits** | Max 100 conexões, 5 por IP | CWE-770 |
| **Prototype Pollution** | Filtro de `__proto__`, `constructor` | CWE-1321 |
| **Path Traversal** | Regex validation em endpoints | CWE-22 |
| **Security Headers** | HSTS, CSP, X-Frame-Options | Múltiplos |

### 9.2 Headers de Segurança

```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 9.3 CORS

Domínios permitidos (configurável via `ALLOWED_ORIGINS`):
- `https://<SEU_DOMINIO>`
- `https://<SEU_DOMINIO>`

### 9.4 Container Security

- ✅ Executa como usuário não-root (`advbox:1001`)
- ✅ Imagem Alpine mínima
- ✅ Sem shell de root
- ✅ Recursos limitados (512MB RAM, 1 CPU)

### 9.5 Boas Práticas

1. **Rotacione o MCP_TOKEN** a cada 90 dias
2. **Monitore** tentativas de autenticação falhadas
3. **Mantenha** o container atualizado
4. **Use HTTPS** sempre (via Traefik)

---

## 10. Integração com n8n

### 10.1 Configuração do MCP Client

No n8n, configure o nó **MCP Client** com:

| Campo | Valor |
|-------|-------|
| **URL** | `https://<SEU_DOMINIO>/sse` |
| **Authentication** | Header Auth |
| **Header Name** | `Authorization` |
| **Header Value** | `Bearer <MCP_TOKEN>` |

### 10.2 Tools Mais Usadas em Automações

| Automação | Tools |
|-----------|-------|
| Busca de clientes | `search_customers`, `get_customer` |
| Criação de processos | `get_settings`, `create_lawsuit` |
| Relatórios financeiros | `list_transactions` |
| Agenda | `list_tasks`, `create_task` |
| Gamificação | `get_users_rewards` |

---

## 11. Monitoramento

### 11.1 Health Check

```bash
curl https://<SEU_DOMINIO>/health
# {"status":"healthy","version":"2.2.0","tools":19,"sse":0}
```

### 11.2 Logs do Container

```bash
# Ver logs em tempo real
docker logs -f advbox-mcp-api

# Últimas 100 linhas
docker logs --tail 100 advbox-mcp-api
```

### 11.3 Métricas a Monitorar

| Métrica | Descrição | Alerta |
|---------|-----------|--------|
| `sse` | Conexões SSE ativas | > 80 |
| Health status | Estado do servidor | ≠ healthy |
| Response time | Tempo de resposta | > 5s |
| Error rate | Taxa de erros 5xx | > 1% |

### 11.4 Integração com Uptime Kuma

```yaml
Type: HTTP(s)
URL: https://<SEU_DOMINIO>/health
Method: GET
Expected Status: 200
Interval: 60 seconds
Retries: 3
```

---

## 12. Troubleshooting

### 12.1 Erros Comuns

#### 401 Unauthorized

**Causa:** Token ausente ou inválido

**Solução:**
```bash
# Verificar token
cat /opt/stacks/advbox-mcp-server/.env | grep MCP_TOKEN

# Testar com curl
curl -H "Authorization: Bearer <TOKEN>" https://<SEU_DOMINIO>/tools
```

#### 429 Too Many Requests

**Causa:** Rate limit excedido (100 req/min)

**Solução:** Aguardar 60 segundos ou otimizar requisições

#### 503 Too many connections

**Causa:** Limite de conexões SSE atingido (100)

**Solução:**
```bash
docker restart advbox-mcp-api
```

#### Connection refused

**Causa:** Container não está rodando

**Solução:**
```bash
docker ps | grep advbox
docker logs advbox-mcp-api
docker compose up -d advbox-api
```

#### API error 401 (Advbox)

**Causa:** Token do Advbox inválido

**Solução:**
```bash
cat /opt/stacks/advbox-mcp-server/.env | grep ADVBOX_API_TOKEN
curl -H "Authorization: Bearer <ADVBOX_TOKEN>" https://app.advbox.com.br/api/v1/settings
```

### 12.2 Comandos de Diagnóstico

```bash
# Status do container
docker inspect advbox-mcp-api | jq '.[0].State'

# Uso de recursos
docker stats advbox-mcp-api --no-stream

# Verificar rede
docker exec advbox-mcp-api wget -qO- http://localhost:3000/health

# Rebuild completo
cd /opt/stacks/advbox-mcp-server
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## 13. Changelog

### v2.2.0 (05/01/2026) - HARDENED

**Segurança:**
- ✅ Timing-safe token comparison
- ✅ Proteção contra Prototype Pollution
- ✅ Rate limiting com proteção memory exhaustion
- ✅ Limite de conexões SSE (global e por IP)
- ✅ Timeout em conexões SSE (1 hora)
- ✅ CORS restritivo com whitelist
- ✅ Validação de email
- ✅ Headers de segurança (HSTS)

### v2.1.0 (05/01/2026)
- ✅ Autenticação Bearer Token
- ✅ Rate Limiting básico
- ✅ Input validation

### v2.0.0 (04/01/2026)
- ✅ Servidor HTTP standalone
- ✅ 19 tools funcionais
- ✅ Suporte SSE

### v1.0.0 (03/01/2026)
- Versão inicial (STDIO)

---

## 14. Referência Rápida

### Credenciais de Produção

| Item | Valor |
|------|-------|
| **Endpoint SSE** | `https://<SEU_DOMINIO>/sse` |
| **Endpoint Execute** | `https://<SEU_DOMINIO>/execute` |
| **MCP Token** | `<SEU_MCP_TOKEN>` |
| **Porta Local** | `3847` |

### Comando de Teste Rápido

```bash
# Testar autenticação
curl -s -H "Authorization: Bearer <SEU_MCP_TOKEN>" \
  https://<SEU_DOMINIO>/health

# Listar tools
curl -s -H "Authorization: Bearer <SEU_MCP_TOKEN>" \
  https://<SEU_DOMINIO>/tools | jq '.tools[].name'
```

---

*Documentação gerada em 05/01/2026 - Jonas Sousa*

---

## 15. Integração com Claude Desktop

### 15.1 Pré-requisitos

- **Node.js** instalado (versão 18+)
- **Claude Desktop** instalado

Verifique se o Node.js está instalado:
```bash
node --version
npx --version
```

Se não tiver, baixe em: https://nodejs.org/

### 15.2 Localização do Arquivo de Configuração

| Sistema | Caminho |
|---------|--------|
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Linux** | `~/.config/Claude/claude_desktop_config.json` |

### 15.3 Configuração

Edite o arquivo `claude_desktop_config.json` e adicione:

```json
{
  "mcpServers": {
    "advbox": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://<SEU_DOMINIO>/sse",
        "--transport",
        "sse-only",
        "--header",
        "Authorization:Bearer <SEU_MCP_TOKEN>"
      ]
    }
  }
}
```

> **Nota:** Se já existir conteúdo no arquivo, adicione apenas a seção `mcpServers` mantendo as outras configurações.

**Exemplo com configurações existentes:**

```json
{
  "preferences": {
    "chromeExtensionEnabled": true
  },
  "mcpServers": {
    "advbox": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://<SEU_DOMINIO>/sse",
        "--transport",
        "sse-only",
        "--header",
        "Authorization:Bearer <SEU_MCP_TOKEN>"
      ]
    }
  }
}
```

### 15.4 Parâmetros Explicados

| Parâmetro | Descrição |
|-----------|----------|
| `npx` | Executor de pacotes Node.js |
| `-y` | Aceita automaticamente a instalação do pacote |
| `mcp-remote` | Pacote que faz ponte entre STDIO e SSE remoto |
| `https://<SEU_DOMINIO>/sse` | URL do servidor MCP Advbox |
| `--transport sse-only` | Força conexão via SSE (obrigatório) |
| `--header` | Header de autenticação |
| `Authorization:Bearer ...` | Token de autenticação (sem espaço após ":") |

### 15.5 Ativação

1. **Salve** o arquivo `claude_desktop_config.json`
2. **Feche completamente** o Claude Desktop (incluindo na bandeja do sistema)
3. **Abra** o Claude Desktop novamente
4. Verifique se aparece o ícone de **ferramentas/MCP** na interface

### 15.6 Verificação

Após reiniciar, teste com um dos comandos:

- "Liste as tools disponíveis do Advbox"
- "Busque clientes com nome Silva no Advbox"
- "Quais são os usuários do escritório?"

### 15.7 Troubleshooting Claude Desktop

#### Verificar Logs

No Claude Desktop, acesse: **View → Toggle Developer Tools → Console**

#### Erros Comuns

| Erro | Causa | Solução |
|------|-------|--------|
| `command is required` | Formato JSON incorreto | Use o formato com `command` e `args` |
| `transport strategy: http-first` | Falta `--transport sse-only` | Adicione o parâmetro |
| `Request timed out` | Servidor não respondeu | Verifique se o servidor está online |
| `Server disconnected` | Conexão caiu | Verifique rede e reinicie Claude Desktop |

#### Testar Conexão Manualmente

No terminal, execute:
```bash
npx -y mcp-remote https://<SEU_DOMINIO>/sse --transport sse-only --header "Authorization:Bearer <SEU_MCP_TOKEN>"
```

Se conectar corretamente, você verá mensagens JSON sendo trocadas.

### 15.8 Múltiplos Servidores MCP

Para adicionar outros servidores MCP junto com o Advbox:

```json
{
  "mcpServers": {
    "advbox": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://<SEU_DOMINIO>/sse",
        "--transport",
        "sse-only",
        "--header",
        "Authorization:Bearer <SEU_MCP_TOKEN>"
      ]
    },
    "outro-servidor": {
      "command": "npx",
      "args": ["-y", "outro-mcp-server"]
    }
  }
}
```

---

*Seção adicionada em 05/01/2026*
