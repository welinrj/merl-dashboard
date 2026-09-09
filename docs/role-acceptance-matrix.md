# MERL Portal role acceptance matrix

Use representative test accounts. UI visibility and server-side enforcement must both pass.

| Capability | System Administrator | DoCC M&E Officer | Assigned Project Manager | Unassigned Project Manager | Viewer / Executive |
|---|---:|---:|---:|---:|---:|
| View portfolio overview | Yes | Yes | Scoped | Scoped | Yes |
| Register project | Yes | Yes | Yes where policy allows | Yes where policy allows | No |
| Edit results framework | All projects | All projects | Assigned projects only | No | No |
| Add/edit/delete indicators | All projects | All projects | Assigned projects only | No | No |
| Enter MERL reporting data | All projects | All projects | Assigned projects only | No | No |
| Submit reporting period | Yes | Yes | Assigned projects only | No | No |
| Review/return report | Override only | Yes | No | No | No |
| Approve report | Override only | Yes | No | No | No |
| Reopen approved report | Override only | Yes | No | No | No |
| View financial analysis | Yes | Yes | Assigned scope | Assigned scope if permitted | No unless explicitly granted |
| View project analysis | Yes | Yes | Assigned scope | Assigned scope | Yes/read-only scope |
| Generate reports | Yes | Yes | Assigned scope | Assigned scope | Read-only reports |
| Administration | Yes | No | No | No | No |

## Required negative tests
- A Viewer cannot mutate data by calling an RPC directly from the browser console.
- An unassigned Project Manager cannot edit another project's framework even if the project ID is manually inserted into a request.
- A Project Manager cannot call review/approval RPCs.
- A failed permission lookup must leave the page read-only; it must never fall back to portfolio-wide editing.
- Approved reporting data cannot be modified without a controlled reopen action.

## Required positive workflow
1. Assigned Project Manager opens assigned project.
2. Adds or updates a framework record.
3. Creates/opens a reporting period and saves required sections.
4. Submits the period.
5. DoCC M&E Officer opens Review & Approval.
6. Reviewer either returns with comments or approves.
7. Returned report is corrected and resubmitted.
8. Approved data appears in internal analysis and approved public/reporting scopes.
