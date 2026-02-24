"use client";

export default function TeamPerformance({ accountExecutives }: { accountExecutives: any[] }) {
  return (
    <div className="p-6 bg-balboa-bg-alt rounded-lg">
      <h2 className="text-2xl font-bold mb-6">Team Performance</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white border-b border-balboa-border">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-center p-3">Close Rate</th>
              <th className="text-center p-3">Reply Rate</th>
              <th className="text-center p-3">Meeting Rate</th>
              <th className="text-center p-3">Playbook Score</th>
            </tr>
          </thead>
          <tbody>
            {accountExecutives.map((ae: any) => (
              <tr key={ae.id} className="bg-white border-b border-balboa-border hover:bg-balboa-bg-alt">
                <td className="p-3 font-bold">{ae.name}</td>
                <td className="text-center p-3">{Math.round(ae.metrics_close_rate || 0)}%</td>
                <td className="text-center p-3">{Math.round(ae.metrics_reply_rate || 0)}%</td>
                <td className="text-center p-3">{Math.round(ae.metrics_meeting_rate || 0)}%</td>
                <td className="text-center p-3">
                  <span className={`px-2 py-1 rounded ${(ae.metrics_playbook_adherence || 0) > 90 ? "bg-balboa-green text-white" : "bg-balboa-yellow text-white"}`}>
                    {Math.round(ae.metrics_playbook_adherence || 0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {accountExecutives.length === 0 && (
        <div className="text-center py-8 text-balboa-text-muted">
          No team members yet. Invite your team to get started.
        </div>
      )}
    </div>
  );
}
