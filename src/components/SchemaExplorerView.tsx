import { Check, Copy, Database, Download, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { DDL_TABLE_SUMMARIES, POSTGRESQL_DDL_SCRIPT } from '../data/ddlMetadata';

export function SchemaExplorerView() {
  const [copied, setCopied] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'Master' | 'Transaksi' | 'Audit & SLA'>('ALL');

  const visibleTables = DDL_TABLE_SUMMARIES.filter((t) =>
    categoryFilter === 'ALL' ? true : t.category === categoryFilter
  );

  async function handleCopySql() {
    try {
      await navigator.clipboard.writeText(POSTGRESQL_DDL_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function handleDownloadSql() {
    const blob = new Blob([POSTGRESQL_DDL_SCRIPT], { type: 'application/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simpel_pintu_postgresql_ddl.sql';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Architecture Highlights */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-900" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                Arsitektur Skema PostgreSQL 15+ (3NF & Concurrency-Safe)
              </h2>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Dirancang untuk PRD SIMPEL PINTU: mencegah race condition saat pemesanan paralel melalui{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-900">
                btree_gist
              </code>{' '}
              dan{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-900">
                EXCLUDE USING gist
              </code>{' '}
              pada rentang waktu half-open{' '}
              <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-900">
                [waktu_mulai, waktu_selesai)
              </code>
              .
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopySql}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md whitespace-nowrap cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Tersalin' : 'Salin DDL SQL'}
            </button>
            <button
              type="button"
              onClick={handleDownloadSql}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 rounded-md whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              Unduh .sql
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-xs">
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-blue-900" aria-hidden="true" />
              Atomic Overlap Prevention
            </div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Dua constraint eksklusi GiST parsial (<code className="font-mono">excl_no_room_time_overlap</code> dan{' '}
              <code className="font-mono">excl_no_instructor_time_overlap</code>) menolak double-booking di level database
              meski 2 request masuk pada milidetik yang sama.
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="font-semibold text-slate-900">Auto-Release Trigger</div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              Trigger <code className="font-mono">trg_permohonan_sync_slot</code> otomatis melepas slot (
              <code className="font-mono">status_slot = &apos;RELEASED&apos;</code>) saat tiket ditolak/dibatalkan,
              sehingga ruangan langsung tersedia kembali.
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md">
            <div className="font-semibold text-slate-900">Real-Time SLA View</div>
            <p className="text-slate-600 mt-1 leading-relaxed">
              View <code className="font-mono">v_permohonan_sla_monitor</code> menghitung sisa jam SLA & status warna
              (AMAN / WARNING &ge;75% / TERLEWAT) secara konsisten untuk worker eskalasi.
            </p>
          </div>
        </div>
      </section>

      {/* Normalized Entity Dictionary */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Kamus Tabel & Relasi (10 Tabel Ternormalisasi)
          </h3>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['ALL', 'Master', 'Transaksi', 'Audit & SLA'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'ALL' ? 'Semua' : cat}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">Tabel</th>
                <th className="py-2.5 px-4">Fungsi & Normalisasi</th>
                <th className="py-2.5 px-4">Kolom Kunci & Constraints</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {visibleTables.map((tbl) => (
                <tr key={tbl.tableName} className="align-top hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="font-mono font-semibold text-blue-900">{tbl.tableName}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{tbl.category}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700 leading-relaxed max-w-md">{tbl.purpose}</td>
                  <td className="py-3 px-4">
                    <div className="font-mono text-[11px] text-slate-800">
                      {tbl.keyColumns.join(' · ')}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {tbl.constraints.join(' · ')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Complete PostgreSQL DDL Code Block */}
      <section className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <span className="font-mono font-semibold">database/schema.sql (PostgreSQL 15+)</span>
          <span className="font-mono text-slate-400 tabular-nums">
            {POSTGRESQL_DDL_SCRIPT.split('\n').length} baris
          </span>
        </div>
        <pre className="p-5 overflow-x-auto text-xs font-mono leading-relaxed text-slate-100 max-h-[540px]">
          <code>{POSTGRESQL_DDL_SCRIPT}</code>
        </pre>
      </section>
    </div>
  );
}
