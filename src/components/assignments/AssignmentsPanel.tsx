import Link from "next/link";
import {
  canAssignPatients,
  canRemoveAssignment,
  isCovering,
  sortAssignments,
  ROLE_LABEL,
  type ConsoleAccess,
  type PatientAssignment,
  type Person,
} from "@/domain";
import { formatDate, personName } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AssignForm,
  AssignmentFeedback,
  RemoveAssignmentForm,
  ReplaceAssignmentForm,
  type MemberOption,
} from "./AssignmentForms";

function assignmentStatus(assignment: PatientAssignment) {
  if (isCovering(assignment)) return <Badge variant="ok">Active</Badge>;
  if (assignment.role) return <Badge variant="neutral">Deactivated</Badge>;
  return <Badge variant="warn">Not in this laboratory</Badge>;
}

/**
 * Who is assigned to one patient, and — for the laboratory's org admin — the
 * controls to assign, remove and hand over. Anyone active in the laboratory can
 * be assigned, org admins included. A super admin reads the list only.
 */
export function AssignmentsPanel({
  patientId,
  assignments,
  assignable,
  access,
}: {
  patientId: string;
  assignments: readonly PatientAssignment[];
  /** The laboratory's active members, either role, not yet assigned. */
  assignable: readonly Person[];
  access: ConsoleAccess;
}) {
  const editable = canAssignPatients(access);
  const options: MemberOption[] = assignable.map((person) => ({
    userId: person.userId,
    label: `${person.fullName?.trim() || person.email || person.userId.slice(0, 8)} · ${ROLE_LABEL[person.role]}`,
  }));
  const rows = sortAssignments(assignments);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-stone-ink">Assigned</h2>
        <p className="text-[12px] text-stone-mid">
          Only the people assigned see this patient in the app, from their next sync.
        </p>
      </div>

      <AssignmentFeedback>
        {rows.length === 0 ? (
          <p className="rounded-[12px] border border-stone-hair bg-surface p-6 text-[13px] text-stone-mid">
            Nobody is assigned to this patient.
          </p>
        ) : (
          <Table className="min-w-[720px]">
            <TableCaption>People assigned to this patient</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                {editable ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((assignment) => (
                <TableRow key={assignment.userId}>
                  <TableCell className="font-medium text-stone-ink">
                    {assignment.role && editable ? (
                      <Link href={`/medtechs/${assignment.userId}`} className="hover:text-maroon">
                        {personName(assignment)}
                      </Link>
                    ) : (
                      personName(assignment)
                    )}
                  </TableCell>
                  <TableCell className="text-stone-deep">
                    {assignment.role ? ROLE_LABEL[assignment.role] : "—"}
                  </TableCell>
                  <TableCell>{assignmentStatus(assignment)}</TableCell>
                  <TableCell className="tnum">{formatDate(assignment.linkedAt)}</TableCell>
                  {editable ? (
                    <TableCell className="text-right">
                      {canRemoveAssignment(assignments, assignment.userId) ? (
                        <RemoveAssignmentForm
                          patientId={patientId}
                          userId={assignment.userId}
                          name={personName(assignment)}
                        />
                      ) : (
                        <ReplaceAssignmentForm
                          patientId={patientId}
                          userId={assignment.userId}
                          options={options}
                        />
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {editable ? (
          options.length > 0 ? (
            <Card>
              <CardContent>
                <AssignForm patientId={patientId} options={options} />
              </CardContent>
            </Card>
          ) : (
            <p className="text-[12px] text-stone-mid">
              Everyone active in this laboratory is already assigned.
            </p>
          )
        ) : null}
      </AssignmentFeedback>
    </section>
  );
}
