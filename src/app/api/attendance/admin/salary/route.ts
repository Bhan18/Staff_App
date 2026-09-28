import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/attendance/staff-auth";
import {
  listSalarySettings,
  listSalaryRecords,
  upsertSalarySettings,
  computeSalary,
  computeSalaryForAll,
  updateSalaryRecordStatus,
} from "@/lib/attendance/salary";
import { errorResponse, withAttendanceErrorHandler, jsonNoCache } from "@/lib/attendance/server-context";

export const dynamic = "force-dynamic";

// Salary overview — per-employee salary settings plus computed monthly records.
export const GET = withAttendanceErrorHandler(
  async (req: NextRequest) => {
    const guard = await requireAdminSession(req);
    if (!guard.authorized) return guard.response;

    const [settings, records] = await Promise.all([
      listSalarySettings(),
      listSalaryRecords(),
    ]);

    return jsonNoCache({ settings, records });
  },
  "admin/salary",
);

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * POST /api/attendance/admin/salary
 * Actions (body.action):
 *   - "upsert-settings": { employeeId, baseSalary, hraAllowance?, travelAllowance?,
 *       specialAllowance?, pfDeduction?, otherDeduction?, allowedHolidaysPerMonth?,
 *       perDayRateOverride?, notes? } — add or edit one employee's salary setup.
 *   - "compute": { employeeId?, month, year } — compute salary for one employee
 *       (or all employees with settings when employeeId is omitted).
 */
export const POST = withAttendanceErrorHandler(
  async (req: NextRequest) => {
    const guard = await requireAdminSession(req);
    if (!guard.authorized) return guard.response;

    const body = await req.json().catch(() => null);
    const ctx = { adminUserIdentifier: guard.employee.employee_code };

    if (body?.action === "upsert-settings") {
      if (!body?.employeeId) return errorResponse("employeeId is required", 400);
      const baseSalary = Number(body.baseSalary);
      if (!Number.isFinite(baseSalary) || baseSalary <= 0) {
        return errorResponse("baseSalary must be a positive number", 400);
      }
      try {
        const item = await upsertSalarySettings(
          {
            employeeId: String(body.employeeId),
            baseSalary,
            hraAllowance: num(body.hraAllowance),
            travelAllowance: num(body.travelAllowance),
            specialAllowance: num(body.specialAllowance),
            pfDeduction: num(body.pfDeduction),
            otherDeduction: num(body.otherDeduction),
            allowedHolidaysPerMonth: num(body.allowedHolidaysPerMonth, 2),
            perDayRateOverride:
              body.perDayRateOverride != null && body.perDayRateOverride !== ""
                ? num(body.perDayRateOverride)
                : null,
            notes: body.notes ? String(body.notes) : undefined,
          },
          ctx,
        );
        return jsonNoCache({ item });
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "Could not save settings", 400);
      }
    }

    if (body?.action === "compute") {
      const month = Number(body.month);
      const year = Number(body.year);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return errorResponse("month (1-12) is required", 400);
      }
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return errorResponse("year is required", 400);
      }
      try {
        if (body?.employeeId) {
          const item = await computeSalary(String(body.employeeId), month, year, ctx);
          return jsonNoCache({ item });
        }
        const result = await computeSalaryForAll(month, year, ctx);
        return jsonNoCache(result);
      } catch (err) {
        return errorResponse(err instanceof Error ? err.message : "Could not compute salary", 400);
      }
    }

    return errorResponse('action must be "upsert-settings" or "compute"', 400);
  },
  "admin/salary POST",
);

/**
 * PATCH /api/attendance/admin/salary
 * Move a salary record DRAFT -> APPROVED -> PAID.
 * Body: { id, status }
 */
export const PATCH = withAttendanceErrorHandler(
  async (req: NextRequest) => {
    const guard = await requireAdminSession(req);
    if (!guard.authorized) return guard.response;

    const body = await req.json().catch(() => null);
    if (!body?.id) return errorResponse("id is required", 400);
    if (!["DRAFT", "APPROVED", "PAID"].includes(body?.status)) {
      return errorResponse("status must be DRAFT, APPROVED or PAID", 400);
    }

    const ctx = { adminUserIdentifier: guard.employee.employee_code };
    try {
      const item = await updateSalaryRecordStatus(String(body.id), body.status, ctx);
      return jsonNoCache({ item });
    } catch (err) {
      return errorResponse(err instanceof Error ? err.message : "Could not update salary record", 400);
    }
  },
  "admin/salary PATCH",
);
