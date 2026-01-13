#!/usr/bin/env node

/**
 * MCP Finance Server - Entry Point
 */

import dotenv from 'dotenv';
import { FinanceMCPServer } from './server.js';

// Load environment variables
dotenv.config();

/**
 * Main entry point
 */
async function main() {
  try {
    const server = new FinanceMCPServer();
    await server.start();

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.error('\n[INFO] Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('\n[INFO] Received SIGTERM, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('[FATAL] Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
main();
