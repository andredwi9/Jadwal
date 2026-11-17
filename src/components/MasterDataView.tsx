import { Plus } from 'lucide-react';
import { useState } from 'react';
import { getInstructorWeeklyHours } from '../domain/scheduling';
import type { AppUser, FasilitasRuangan, JadwalReservasi, Pemateri } from '../types/simpel';

interface MasterDataViewProps {
  currentUser: AppUser;
  rooms: FasilitasRuangan[];
  instructors: Pemateri[];
  reservations: JadwalReservasi[];
  onAddRoom: (room: Omit<FasilitasRuangan, 'id'>) => void;
  onToggleRoomActive: (roomId: string) => void;
  onAddInstructor: (instructor: Omit<Pemateri, 'id'>) => void;
  onToggleInstructorActive: (instructorId: string) => void;
}

export function MasterDataView({
  currentUser,
  rooms,
  instructors,
  reservations,
  onAddRoom,
  onToggleRoomActive,
  onAddInstructor,
  onToggleInstructorActive,
}: MasterDataViewProps) {
  const [subTab, setSubTab] = useState<'rooms' | 'instructors'>('rooms');
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomLocation, setRoomLocation] = useState('');
  const [roomCapacity, setRoomCapacity] = useState(30);

  const [instName, setInstName] = useState('');
  const [instNip, setInstNip] = useState('');
  const [instSpec, setInstSpec] = useState('');
  const [instMaxHours, setInstMaxHours] = useState(20);

  const canManage = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'VERIFIKATOR';
  const nowIso = new Date().toISOString();

  function handleRoomSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roomCode.trim() || !roomName.trim() || roomCapacity <= 0) return;
    onAddRoom({
      kodeRuangan: roomCode.trim().toUpperCase(),
      namaRuangan: roomName.trim(),
      lokasiGedung: roomLocation.trim() || 'Gedung Diklat Lt. 1',
      lantai: 1,
      kapasitas: roomCapacity,
      fasilitasDetail: {
        proyektor: true,
        ac: true,
        audio: true,
        videoConf: false,
        layoutDefault: 'Klasikal',
      },
      isActive: true,
    });
    setRoomCode('');
    setRoomName('');
    setRoomLocation('');
    setRoomCapacity(30);
  }

  function handleInstructorSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instName.trim() || !instNip.trim()) return;
    onAddInstructor({
      namaPemateri: instName.trim(),
      nip: instNip.trim(),
      spesialisasi: instSpec.trim() || 'Kompetensi Teknis ASN',
      maxJamMengajarMingguan: instMaxHours,
      email: `${instNip.trim()}@instansi.go.id`,
      noWhatsapp: '+628110000000',
      isActive: true,
    });
    setInstName('');
    setInstNip('');
    setInstSpec('');
    setInstMaxHours(20);
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div role="tablist" aria-label="Pilih master data" className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'rooms'}
            onClick={() => setSubTab('rooms')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'rooms' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Fasilitas Ruangan ({rooms.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'instructors'}
            onClick={() => setSubTab('instructors')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'instructors'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            SDM Pemateri ({instructors.length})
          </button>
        </div>

        <p className="text-xs text-slate-500">
          {canManage
            ? `Mode Kelola Aktif (${currentUser.roleLabel})`
            : 'Mode Baca: Ganti peran ke Super Admin / Verifikator untuk mengubah master data.'}
        </p>
      </div>

      {subTab === 'rooms' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Kode & Nama Ruangan</th>
                  <th className="py-2.5 px-4">Kapasitas</th>
                  <th className="py-2.5 px-4">Fasilitas</th>
                  <th className="py-2.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {rooms.map((room) => (
                  <tr key={room.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-mono text-xs font-semibold text-blue-900">
                        {room.kodeRuangan}
                      </div>
                      <div className="font-semibold text-slate-900">{room.namaRuangan}</div>
                      <div className="text-xs text-slate-500">{room.lokasiGedung}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700">
                      {room.kapasitas} kursi
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {[
                        room.fasilitasDetail.proyektor && 'Proyektor',
                        room.fasilitasDetail.ac && 'AC',
                        room.fasilitasDetail.audio && 'Audio',
                        room.fasilitasDetail.videoConf && 'VideoConf',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => onToggleRoomActive(room.id)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                          room.isActive
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-slate-600 bg-slate-100 border-slate-200'
                        }`}
                      >
                        {room.isActive ? 'Aktif' : 'Non-Aktif'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={handleRoomSubmit}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
              Tambah Ruangan Baru
            </h2>
            <div>
              <label htmlFor="new-room-code" className="block text-xs font-medium text-slate-700 mb-1">
                Kode Ruangan
              </label>
              <input
                id="new-room-code"
                type="text"
                required
                disabled={!canManage}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                placeholder="KLS-302"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-100"
              />
            </div>
            <div>
              <label htmlFor="new-room-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nama Ruangan
              </label>
              <input
                id="new-room-name"
                type="text"
                required
                disabled={!canManage}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="Ruang Simulasi Crisis Center"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-100"
              />
            </div>
            <div>
              <label htmlFor="new-room-loc" className="block text-xs font-medium text-slate-700 mb-1">
                Lokasi Gedung
              </label>
              <input
                id="new-room-loc"
                type="text"
                disabled={!canManage}
                value={roomLocation}
                onChange={(e) => setRoomLocation(e.target.value)}
                placeholder="Gedung Utama Lt. 2"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-100"
              />
            </div>
            <div>
              <label htmlFor="new-room-cap" className="block text-xs font-medium text-slate-700 mb-1">
                Kapasitas Maksimal (Peserta)
              </label>
              <input
                id="new-room-cap"
                type="number"
                min={5}
                max={1000}
                required
                disabled={!canManage}
                value={roomCapacity}
                onChange={(e) => setRoomCapacity(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md tabular-nums disabled:bg-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={!canManage}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 rounded-md cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Simpan Ruangan
            </button>
          </form>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">NIP & Nama Pemateri</th>
                  <th className="py-2.5 px-4">Spesialisasi</th>
                  <th className="py-2.5 px-4">Beban Minggu Ini</th>
                  <th className="py-2.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {instructors.map((inst) => {
                  const hours = getInstructorWeeklyHours(inst.id, nowIso, reservations);
                  return (
                    <tr key={inst.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs text-slate-500 tabular-nums">
                          NIP {inst.nip}
                        </div>
                        <div className="font-semibold text-slate-900">{inst.namaPemateri}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-700">{inst.spesialisasi}</td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700">
                        {hours.toFixed(1)} / {inst.maxJamMengajarMingguan} jam
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          disabled={!canManage}
                          onClick={() => onToggleInstructorActive(inst.id)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded border cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                            inst.isActive
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : 'text-slate-600 bg-slate-100 border-slate-200'
                          }`}
                        >
                          {inst.isActive ? 'Aktif' : 'Non-Aktif'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={handleInstructorSubmit}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-900 pb-2 border-b border-slate-200">
              Tambah Pemateri Baru
            </h2>
            <div>
              <label htmlFor="new-inst-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nama & Gelar
              </label>
              <input
                id="new-inst-name"
                type="text"
                required
                disabled={!canManage}
                value={instName}
                onChange={(e) => setInstName(e.target.value)}
                placeholder="Drs. Arif Hidayat, M.Si"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-100"
              />
            </div>
            <div>
              <label htmlFor="new-inst-nip" className="block text-xs font-medium text-slate-700 mb-1">
                NIP
              </label>
              <input
                id="new-inst-nip"
                type="text"
                required
                disabled={!canManage}
                value={instNip}
                onChange={(e) => setInstNip(e.target.value)}
                placeholder="198407122009021001"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md tabular-nums disabled:bg-slate-100"
              />
            </div>
            <div>
              <label htmlFor="new-inst-spec" className="block text-xs font-medium text-slate-700 mb-1">
                Spesialisasi
              </label>
              <input
                id="new-inst-spec"
                type="text"
                disabled={!canManage}
                value={instSpec}
                onChange={(e) => setInstSpec(e.target.value)}
                placeholder="Pengadaan Barang & Jasa Pemerintah"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md disabled:bg-slate-100"
              />
            </div>
            <div>
              <label htmlFor="new-inst-max" className="block text-xs font-medium text-slate-700 mb-1">
                Batas Jam Mengajar / Minggu
              </label>
              <input
                id="new-inst-max"
                type="number"
                min={2}
                max={40}
                required
                disabled={!canManage}
                value={instMaxHours}
                onChange={(e) => setInstMaxHours(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md tabular-nums disabled:bg-slate-100"
              />
            </div>
            <button
              type="submit"
              disabled={!canManage}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:bg-slate-300 rounded-md cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Simpan Pemateri
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
