/**
 * MCP Finance Server - Main server implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { tools, toolHandlers } from './tools/index.js';
import { resources, getResourceHandler } from './resources/index.js';
import { ErrorHandler, FinanceError } from './utils/error-handler.js';

export class FinanceMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-financex',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {}
        }
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('[MCP] Listing tools');
      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      console.error(`[MCP] Tool called: ${name}`);

      try {
        const result = await this.executeTool(name, args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error(`[MCP] Tool error: ${name}`, error);
        const financeError = ErrorHandler.handle(error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(ErrorHandler.toMCPError(financeError), null, 2)
            }
          ],
          isError: true
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      console.error('[MCP] Listing resources');
      return { resources };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params;
      console.error(`[MCP] Resource read: ${uri}`);

      try {
        const content = await this.readResource(uri);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(content, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error(`[MCP] Resource error: ${uri}`, error);
        const financeError = ErrorHandler.handle(error);
        throw financeError;
      }
    });
  }

  /**
   * Execute a tool by name
   */
  private async executeTool(name: string, args: any): Promise<any> {
    const handler = toolHandlers[name];

    if (!handler) {
      throw new FinanceError(
        `Unknown tool: ${name}`,
        'UNKNOWN_TOOL',
        404
      );
    }

    return await handler(args);
  }

  /**
   * Read a resource by URI
   */
  private async readResource(uri: string): Promise<any> {
    const handler = getResourceHandler(uri);

    if (!handler) {
      throw new FinanceError(
        `Unknown resource: ${uri}`,
        'UNKNOWN_RESOURCE',
        404
      );
    }

    return await handler(uri);
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    process.on('uncaughtException', error => {
      console.error('[FATAL] Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('MCP Finance Server started');
    console.error('Available tools:', tools.map(t => t.name).join(', '));
    console.error('Available resources:', resources.map(r => r.uri).join(', '));
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    await this.server.close();
    console.error('MCP Finance Server stopped');
  }
}
