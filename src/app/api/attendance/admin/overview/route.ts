import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/attendance/staff-auth";
import { getOverview } from "@/lib/attendance/records";
import { getAttendanceAdminClient } from "@/lib/attendance/client";
import { withAttendanceErrorHandler, jsonNoCache } from "@/lib/attendance/server-context";

export const dynamic = "force-dynamic";

// Today's summary (present / late / half-day / absent / leave per dept)
// plus who is checked in right now and has not checked out yet.
export const GET = withAttendanceErrorHandler(
  async (req: NextRequest) => {
    const guard = await requireAdminSession(req);
    if (!guard.authorized) return guard.response;

    const overview = await getOverview();

    const supabase = getAttendanceAdminClient();
    const today = new Date();
    const dayStr = `${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const { data: open, error } = await supabase
      .from("attendance_records")
      .select(
        "id, check_in_time, check_out_time, check_in_photo, attendance_employees!inner(id, employee_code, name, department, phone)",
      )
      .eq("attendance_date", dayStr)
      .is("check_out_time", null)
      .order("check_in_time", { ascending: true });
    if (error) throw new Error(error.message);

    const checkedInNow = (open ?? []).map((r) => {
      const emp = r.attendance_employees as unknown as {
        id: string;
        employee_code: string;
        name: string;
        department: string;
        phone: string;
      };
      return {
        employeeId: emp.id,
        employeeCode: emp.employee_code,
        name: emp.name,
        department: emp.department,
        phone: emp.phone,
        checkInTime: r.check_in_time,
        checkInPhoto: r.check_in_photo,
      };
    });

    return jsonNoCache({ overview, checkedInNow });
  },
  "admin/overview",
);
