#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration
const ADVBOX_API_TOKEN = process.env.ADVBOX_API_TOKEN;
const ADVBOX_BASE_URL = process.env.ADVBOX_BASE_URL || "https://app.advbox.com.br/api/v1";

if (!ADVBOX_API_TOKEN) {
  console.error("Error: ADVBOX_API_TOKEN environment variable is required");
  process.exit(1);
}

// API Helper
async function advboxRequest(
  endpoint: string,
  method: string = "GET",
  params?: Record<string, any>,
  body?: Record<string, any>
): Promise<any> {
  let url = `${ADVBOX_BASE_URL}${endpoint}`;
  
  // Add query parameters
  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        if (Array.isArray(value)) {
          value.forEach(v => searchParams.append(key, String(v)));
        } else {
          searchParams.append(key, String(value));
        }
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Authorization": `Bearer ${ADVBOX_API_TOKEN}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Advbox API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// Tool Definitions
const tools: Tool[] = [
  // ==================== CUSTOMERS ====================
  {
    name: "advbox_list_customers",
    description: "List customers from Advbox with various filter options including name, phone, email, location, and creation date. Returns paginated results.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Customer name or part of it (partial search)" },
        phone: { type: "string", description: "Customer phone (e.g., 48991234567)" },
        cellphone: { type: "string", description: "Customer cellphone" },
        identification: { type: "string", description: "Customer CPF/CNPJ" },
        document: { type: "string", description: "Customer document number" },
        email: { type: "string", description: "Customer email address" },
        city: { type: "string", description: "Customer city" },
        state: { type: "string", description: "Customer state" },
        occupation: { type: "string", description: "Customer occupation/profession" },
        birthdays: { type: "boolean", description: "Filter customers with birthdays in current month" },
        created_start: { type: "string", description: "Start date for creation filter (YYYY-MM-DD)" },
        created_end: { type: "string", description: "End date for creation filter (YYYY-MM-DD)" },
        limit: { type: "integer", description: "Number of items (1-1000)", default: 100 },
        offset: { type: "integer", description: "Number of items to skip (pagination)", default: 0 },
      },
    },
  },
  {
    name: "advbox_get_customer",
    description: "Get a specific customer by ID from Advbox",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Customer ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "advbox_create_customer",
    description: "Create a new customer in Advbox. Requires user ID, origin ID, and customer name.",
    inputSchema: {
      type: "object",
      properties: {
        users_id: { type: "integer", description: "ID of the user creating the customer" },
        customers_origins_id: { type: "integer", description: "ID of the customer origin" },
        name: { type: "string", description: "Customer name" },
        email: { type: "string", description: "Customer email address" },
        document: { type: "string", description: "Customer document number" },
        identification: { type: "string", description: "Customer CPF/CNPJ (e.g., 123.456.789-01)" },
        phone: { type: "string", description: "Phone number (99999999999 or (99) 99999-9999)" },
        cellphone: { type: "string", description: "Cellphone number" },
        birthdate: { type: "string", description: "Birthdate (YYYY-MM-DD)" },
        occupation: { type: "string", description: "Occupation/profession" },
        postalcode: { type: "string", description: "Postal code (99999-999)" },
        city: { type: "string", description: "City" },
        state: { type: "string", description: "State (e.g., SP, RJ)" },
        notes: { type: "string", description: "Additional notes" },
      },
      required: ["users_id", "customers_origins_id", "name"],
    },
  },
  {
    name: "advbox_get_birthdays",
    description: "Get customers with birthdays in the current month",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },

  // ==================== LAWSUITS ====================
  {
    name: "advbox_list_lawsuits",
    description: "List lawsuits from Advbox with various filter options including customer, process number, dates, stage, and responsible. Returns paginated results.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Lawsuit name or part of it" },
        customer_id: { type: "integer", description: "Customer ID associated with the lawsuit" },
        identification: { type: "string", description: "Customer CPF/CNPJ" },
        process_number: { type: "string", description: "Process number" },
        protocol_number: { type: "string", description: "Protocol number" },
        folder: { type: "string", description: "Lawsuit folder name" },
        notes: { type: "string", description: "Search in lawsuit notes" },
        group: { type: "string", description: "Filter by group name or ID" },
        type: { type: "string", description: "Filter by type name or ID" },
        responsible: { type: "string", description: "Filter by responsible person" },
        stage: { type: "string", description: "Filter by stage (Judicial, Recursal...)" },
        step: { type: "string", description: "Filter by step (Aguardando retorno...)" },
        process_date_start: { type: "string", description: "Process date start (YYYY-MM-DD)" },
        process_date_end: { type: "string", description: "Process date end (YYYY-MM-DD)" },
        status_closure_start: { type: "string", description: "Closure date start (YYYY-MM-DD)" },
        status_closure_end: { type: "string", description: "Closure date end (YYYY-MM-DD)" },
        created_start: { type: "string", description: "Creation date start (YYYY-MM-DD)" },
        created_end: { type: "string", description: "Creation date end (YYYY-MM-DD)" },
        limit: { type: "integer", description: "Number of items (1-100)", default: 100 },
        offset: { type: "integer", description: "Pagination offset", default: 0 },
      },
    },
  },
  {
    name: "advbox_get_lawsuit",
    description: "Get a specific lawsuit by ID from Advbox",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Lawsuit ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "advbox_create_lawsuit",
    description: "Create a new lawsuit in Advbox. Requires user ID, customer IDs, stage ID, and lawsuit type ID.",
    inputSchema: {
      type: "object",
      properties: {
        users_id: { type: "string", description: "ID of the user creating the lawsuit" },
        customers_id: { 
          type: "array", 
          items: { type: "integer" },
          description: "List of customer IDs associated with the lawsuit" 
        },
        stages_id: { type: "string", description: "ID of the lawsuit stage" },
        type_lawsuits_id: { type: "string", description: "ID of the lawsuit type" },
        process_number: { type: "string", description: "Process number (e.g., 0123456-78.2025.8.26.0100)" },
        protocol_number: { type: "string", description: "Protocol number" },
        folder: { type: "string", description: "Folder name" },
        date: { type: "string", description: "Lawsuit date (YYYY-MM-DD)" },
        notes: { type: "string", description: "Detailed notes about the lawsuit" },
      },
      required: ["users_id", "customers_id", "stages_id", "type_lawsuits_id"],
    },
  },
  {
    name: "advbox_update_lawsuit",
    description: "Update an existing lawsuit in Advbox",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", description: "Lawsuit ID to update" },
        process_number: { type: "string", description: "Process number" },
        protocol_number: { type: "string", description: "Protocol number" },
        folder: { type: "string", description: "Folder name" },
        notes: { type: "string", description: "Notes" },
        stages_id: { type: "string", description: "Stage ID" },
        type_lawsuits_id: { type: "string", description: "Lawsuit type ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "advbox_get_lawsuit_history",
    description: "Get the task history of a specific lawsuit",
    inputSchema: {
      type: "object",
      properties: {
        lawsuit_id: { type: "integer", description: "Lawsuit ID" },
      },
      required: ["lawsuit_id"],
    },
  },
  {
    name: "advbox_get_lawsuit_movements",
    description: "Get the movements/updates of a specific lawsuit",
    inputSchema: {
      type: "object",
      properties: {
        lawsuit_id: { type: "integer", description: "Lawsuit ID" },
      },
      required: ["lawsuit_id"],
    },
  },
  {
    name: "advbox_create_movement",
    description: "Create a new movement/update for a lawsuit",
    inputSchema: {
      type: "object",
      properties: {
        lawsuit_id: { type: "integer", description: "Lawsuit ID" },
        description: { type: "string", description: "Movement description" },
        date: { type: "string", description: "Movement date (YYYY-MM-DD)" },
      },
      required: ["lawsuit_id", "description"],
    },
  },
  {
    name: "advbox_get_last_movements",
    description: "Get the latest movements across all lawsuits with filter options",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Number of items", default: 50 },
        offset: { type: "integer", description: "Pagination offset", default: 0 },
      },
    },
  },

  // ==================== TASKS ====================
  {
    name: "advbox_list_tasks",
    description: "List tasks/appointments from Advbox. Note: Date filters require both start AND end dates. Maximum range is 90 days.",
    inputSchema: {
      type: "object",
      properties: {
        date_start: { type: "string", description: "Appointment date start (YYYY-MM-DD) - requires date_end" },
        date_end: { type: "string", description: "Appointment date end (YYYY-MM-DD) - requires date_start" },
        created_start: { type: "string", description: "Creation date start (YYYY-MM-DD) - requires created_end" },
        created_end: { type: "string", description: "Creation date end (YYYY-MM-DD) - requires created_start" },
        deadline_start: { type: "string", description: "Deadline date start (YYYY-MM-DD) - requires deadline_end" },
        deadline_end: { type: "string", description: "Deadline date end (YYYY-MM-DD) - requires deadline_start" },
        completed_start: { type: "string", description: "Completion date start (YYYY-MM-DD) - requires completed_end" },
        completed_end: { type: "string", description: "Completion date end (YYYY-MM-DD) - requires completed_start" },
        user_id: { type: "string", description: "Filter by responsible user ID" },
        user_name: { type: "string", description: "Filter by user name (partial match)" },
        task_id: { type: "string", description: "Filter by task type ID" },
        id: { type: "integer", description: "Filter by specific task ID" },
        lawsuit_id: { type: "string", description: "Filter by lawsuit ID" },
        limit: { type: "integer", description: "Number of items (1-100)", default: 100 },
        offset: { type: "integer", description: "Pagination offset", default: 0 },
      },
    },
  },
  {
    name: "advbox_create_task",
    description: "Create a new task/appointment in Advbox. Requires creator ID, guests, task type, lawsuit, and start date.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "ID of the user creating the task" },
        guests: { 
          type: "array", 
          items: { type: "integer" },
          description: "List of user IDs to be added as guests" 
        },
        tasks_id: { type: "string", description: "ID of the task type" },
        lawsuits_id: { type: "string", description: "ID of the associated lawsuit" },
        start_date: { type: "string", description: "Appointment date (YYYY-MM-DD)" },
        comments: { type: "string", description: "Additional details/instructions" },
        start_time: { type: "string", description: "Start time (HH:MM)" },
        end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
        end_time: { type: "string", description: "End time (HH:MM)" },
        date_deadline: { type: "string", description: "Deadline date (YYYY-MM-DD)" },
        local: { type: "string", description: "Location" },
        urgent: { type: "boolean", description: "Mark as urgent" },
        important: { type: "boolean", description: "Mark as important" },
        display_schedule: { type: "boolean", description: "Show in schedule/calendar" },
      },
      required: ["from", "guests", "tasks_id", "lawsuits_id", "start_date"],
    },
  },

  // ==================== PUBLICATIONS ====================
  {
    name: "advbox_get_publications",
    description: "Get publications for a specific lawsuit",
    inputSchema: {
      type: "object",
      properties: {
        lawsuit_id: { type: "integer", description: "Lawsuit ID" },
      },
      required: ["lawsuit_id"],
    },
  },

  // ==================== TRANSACTIONS ====================
  {
    name: "advbox_list_transactions",
    description: "List financial transactions from Advbox with comprehensive filter options",
    inputSchema: {
      type: "object",
      properties: {
        process_number: { type: "string", description: "Filter by process number" },
        customer_identification: { type: "string", description: "Filter by customer CPF/CNPJ" },
        customer_name: { type: "string", description: "Filter by customer name" },
        responsible: { type: "string", description: "Filter by responsible person" },
        lawsuit_id: { type: "integer", description: "Filter by lawsuit ID" },
        category: { type: "string", description: "Filter by category" },
        description: { type: "string", description: "Filter by description" },
        protocol_number: { type: "string", description: "Filter by protocol number" },
        cost_center: { type: "string", description: "Filter by cost center" },
        debit_bank: { type: "string", description: "Filter by debit bank" },
        competence_start: { type: "string", description: "Competence date start (YYYY-MM-DD)" },
        competence_end: { type: "string", description: "Competence date end (YYYY-MM-DD)" },
        created_start: { type: "string", description: "Creation date start (YYYY-MM-DD)" },
        created_end: { type: "string", description: "Creation date end (YYYY-MM-DD)" },
        date_due_start: { type: "string", description: "Due date start (YYYY-MM-DD)" },
        date_due_end: { type: "string", description: "Due date end (YYYY-MM-DD)" },
        date_payment_start: { type: "string", description: "Payment date start (YYYY-MM-DD)" },
        date_payment_end: { type: "string", description: "Payment date end (YYYY-MM-DD)" },
      },
    },
  },

  // ==================== SETTINGS ====================
  {
    name: "advbox_get_settings",
    description: "Get Advbox account settings and configuration",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// Tool Handler
async function handleToolCall(name: string, args: Record<string, any>): Promise<any> {
  switch (name) {
    // Customers
    case "advbox_list_customers":
      return advboxRequest("/customers", "GET", args);
    
    case "advbox_get_customer":
      return advboxRequest(`/customers/${args.id}`, "GET");
    
    case "advbox_create_customer":
      return advboxRequest("/customers", "POST", args, args);
    
    case "advbox_get_birthdays":
      return advboxRequest("/customers/birthdays", "GET");

    // Lawsuits
    case "advbox_list_lawsuits":
      return advboxRequest("/lawsuits", "GET", args);
    
    case "advbox_get_lawsuit":
      return advboxRequest(`/lawsuits/${args.id}`, "GET");
    
    case "advbox_create_lawsuit":
      return advboxRequest("/lawsuits", "POST", args, args);
    
    case "advbox_update_lawsuit": {
      const { id, ...updateData } = args;
      return advboxRequest(`/lawsuits/${id}`, "PUT", updateData, updateData);
    }
    
    case "advbox_get_lawsuit_history":
      return advboxRequest(`/history/${args.lawsuit_id}/`, "GET");
    
    case "advbox_get_lawsuit_movements":
      return advboxRequest(`/movements/${args.lawsuit_id}`, "GET");
    
    case "advbox_create_movement":
      return advboxRequest("/lawsuits/movement", "POST", args, args);
    
    case "advbox_get_last_movements":
      return advboxRequest("/last_movements", "GET", args);

    // Tasks
    case "advbox_list_tasks":
      return advboxRequest("/posts", "GET", args);
    
    case "advbox_create_task":
      return advboxRequest("/posts", "POST", args, args);

    // Publications
    case "advbox_get_publications":
      return advboxRequest(`/publications/${args.lawsuit_id}`, "GET");

    // Transactions
    case "advbox_list_transactions":
      return advboxRequest("/transactions", "GET", args);

    // Settings
    case "advbox_get_settings":
      return advboxRequest("/settings", "GET");

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Main Server
async function main() {
  const server = new Server(
    {
      name: "advbox-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(name, args || {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Advbox MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
