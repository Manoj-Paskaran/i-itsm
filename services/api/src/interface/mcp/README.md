# MCP server

`POST /api/mcp` speaks the Model Context Protocol (JSON-RPC 2.0 over Streamable HTTP, stateless). An AI assistant connects with a normal I-ITSM access token and acts as that user.

| Tool                    | Who sees it                                      | What it calls                                                  |
| ----------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `search_incidents`      | every signed-in user (results scoped by role)    | `IncidentService.list`                                         |
| `get_incident`          | every signed-in user (object-level checks apply) | `IncidentService.get`                                          |
| `sla_status`            | `REPORTS_VIEW`                                   | `ReportService.sla` + `IncidentService.list`                   |
| `technician_workload`   | `REPORTS_VIEW`                                   | `ReportService.workload`                                       |
| `create_incident_draft` | `INCIDENT_REPORT`                                | validates against `CreateIncidentRequestSchema`; saves nothing |

Design: each tool is a small command object (`McpTool`: name, Zod input, required permission, `run`) built by `createMcpTools`. `McpServer` publishes the tools a caller may use (`tools/list`), checks the permission again on `tools/call`, validates the arguments, and turns domain exceptions into tool errors. No tool adds a business rule.

## Connect an MCP client

```bash
TOKEN=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"vikram@itsm.demo","password":"demo1234"}' | jq -r .accessToken)
# Point any Streamable-HTTP MCP client at http://localhost:3000/api/mcp
# and send the header: Authorization: Bearer $TOKEN
```

The access token expires after `ACCESS_TOKEN_TTL_SECONDS` (1 hour by default); log in again to refresh it.
