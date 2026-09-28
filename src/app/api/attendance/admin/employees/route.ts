import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/attendance/staff-auth";
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "@/lib/attendance/employees";
import { getAttendanceAdminClient } from "@/lib/attendance/client";
import { errorResponse, withAttendanceErrorHandler, jsonNoCache } from "@/lib/attendance/server-context";

export const dynamic = "force-dynamic";

export const GET = withAttendanceErrorHandler(
  async (req: NextRequest) => {
    const guard = await requireAdminSession(req);
    if (!guard.authorized) return guard.response;

    const employees = await listEmployees();

    const supabase = getAttendanceAdminClient();
    const today = new Date();
    const dayStr = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const { data: todays, error } = await supabase
      .from("attendance_records")
      .select(
        "employee_id, status, check_in_time, check_out_time, check_in_photo",
      )
      .eq("attendance_date", dayStr);
    if (error) throw new Error(error.message);
    const byEmployee = new Map<
      string,
      { status: string; checkInTime: string | null; checkOutTime: string | null; checkInPhoto: string | null }
    >();
    for (const r of todays ?? []) {
      byEmployee.set(r.employee_id, {
        status: r.status,
        checkInTime: r.check_in_time,
        checkOutTime: r.check_out_time,
        checkInPhoto: r.check_in_photo,
      });
    }

  const result = employees.map((e) => ({
    id: e.id,
    employeeCode: e.employee_code,
    name: e.name,
    phone: e.phone,
    department: e.department,
    role: e.role,
    status: e.status,
    profilePhoto: e.profile_photo ?? null,
    today: byEmployee.get(e.id) ?? null,
  }));

    return jsonNoCache({ employees: result, date: dayStr });
  },
  "admin/employees",
);

/**
 * POST /api/attendance/admin/employees
 * Add an employee.
 * Body: { employeeCode, name, phone, department, role?, password? }
 */
export const POST = withAttendanceErrorHandler(
  async (req: NextRequest) => {
    const guard = await requireAdminSession(req);
    if (!guard.authorized) return guard.response;

    const body = await req.json().catch(() => null);
    const employeeCode = String(body?.employeeCode ?? "").trim();
    const name = String(body?.name ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const department = String(body?.department ?? "").trim();
    if (!employeeCode || !name || !phone || !department) {
      return errorResponse("employeeCode, name, phone and department are required", 400);
    }
    if (body?.password && String(body.password).length < 4) {
      return errorResponse("Password must be at least 4 characters", 400);
    }

    const ctx = { adminUserIdentifier: guard.employee.employee_code };
    try {
      const created = await createEmployee(
        {
          employeeCode,
          name,
          phone,
          department,
          role: body?.role ? String(body.role).trim() : "Staff",
          profilePhoto: body?.profilePhoto ? String(body.profilePhoto) : null,
          password: body?.password ? String(body.password) : undefined,
        },
        ctx,
      );
      return jsonNoCache({ item: created }, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not create employee";
      if (message.includes("duplicate") || message.includes("unique")) {
        return errorResponse("An employee with this code already exists", 409);
      }
      return errorResponse(message, 500);
    }
  },
  "admin/employees POST",
);

/**
 * PATCH /api/attendance/admin/employees
 * Edit an employee (details, role, status, password reset).
 * Body: { id, name?, phone?, department?, role?, employeeCode?, status?, password? }
 */
export const PATCH = withAttendanceErrorHandler(
  async (req: NextRequest) => {
    const guard = await requireAdminSession(req);
    if (!guard.authorized) return guard.response;

    const body = await req.json().catch(() => null);
    const id = body?.id;
    if (!id) return errorResponse("id is required", 400);

    const patch: Record<string, unknown> = {};
    if (body?.name != null) {
      if (!String(body.name).trim()) return errorResponse("Name cannot be empty", 400);
      patch.name = String(body.name).trim();
    }
    if (body?.phone != null) patch.phone = String(body.phone).trim();
    if (body?.department != null) {
      if (!String(body.department).trim()) return errorResponse("Department cannot be empty", 400);
      patch.department = String(body.department).trim();
    }
    if (body?.role != null) patch.role = String(body.role).trim() || "Staff";
    if (body?.profilePhoto !== undefined) {
      patch.profilePhoto = body.profilePhoto ? String(body.profilePhoto) : null;
    }
    if (body?.employeeCode != null) {
      if (!String(body.employeeCode).trim()) return errorResponse("Employee code cannot be empty", 400);
      patch.employeeCode = String(body.employeeCode).trim();
    }
    if (body?.status != null) {
      if (!["ACTIVE", "INACTIVE"].includes(body.status)) {
        return errorResponse("Invalid status", 400);
      }
      patch.status = body.status;
    }
    if (body?.password != null) {
      if (String(body.password).length < 4) {
        return errorResponse("Password must be at least 4 characters", 400);
      }
      patch.password = String(body.password);
    }
    if (Object.keys(patch).length === 0) {
      return errorResponse("Nothing to update", 400);
    }

    // Prevent an admin from deactivating or demoting themselves.
    if (String(id) === guard.employee.id) {
      if (patch.status === "INACTIVE") {
        return errorResponse("You cannot deactivate your own account", 400);
      }
      if (patch.role === "Staff") {
        return errorResponse("You cannot remove your own admin access", 400);
      }
    }

    const ctx = { adminUserIdentifier: guard.employee.employee_code };
    try {
      const updated = await updateEmployee(String(id), patch as Parameters<typeof updateEmployee>[1], ctx);
      return jsonNoCache({ item: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update employee";
      if (message.includes("Employee not found")) return errorResponse(message, 404);
      return errorResponse(message, 500);
    }
  },
  "admin/employees PATCH",
);

/**
 * DELETE /api/attendance/admin/employees?id=...
 * Hard-delete an employee (dependent records cascade). Cannot delete self.
 */
export const DELETE = withAttendanceErrorHandler(
  async (req: NextRequest) => {
    const guard = await requireAdminSession(req);
    if (!guard.authorized) return guard.response;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return errorResponse("id is required", 400);
    if (id === guard.employee.id) {
      return errorResponse("You cannot delete your own account", 400);
    }

    const ctx = { adminUserIdentifier: guard.employee.employee_code };
    try {
      await deleteEmployee(id, ctx);
      return jsonNoCache({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete employee";
      if (message.includes("Employee not found")) return errorResponse(message, 404);
      return errorResponse(message, 500);
    }
  },
  "admin/employees DELETE",
);
