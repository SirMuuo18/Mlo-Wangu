import React from 'react';
import { Smartphone, Download } from 'lucide-react';
import { APK_DOWNLOAD_URL } from '../data/androidDownload';

// Manual click only: a plain anchor with `download`. No effect, redirect, or
// platform/auth check ever fires this — the browser only navigates/downloads
// when a visitor explicitly activates the link.
export const AndroidDownloadSection: React.FC = () => {
  return (
    <div className="w-full max-w-sm mt-6 bg-[#172554] rounded-3xl shadow-2xl border border-[#1e3a8a] p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2.5 rounded-2xl bg-white/10 text-[#F4B942] shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-extrabold text-white">Get Mlo Wangu on Android</h2>
          <p className="text-[11px] text-blue-200">Download the latest Android app</p>
        </div>
      </div>

      <a
        href={APK_DOWNLOAD_URL}
        download
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-3 bg-[#F4B942] hover:bg-[#E5A72E] text-[#17201A] font-extrabold text-sm rounded-2xl transition-all shadow-md cursor-pointer"
      >
        <Download className="w-4 h-4" />
        Download Android App
      </a>

      <p className="text-center text-[11px] text-blue-300/60 mt-3">
        Preview build — not yet on Google Play.
      </p>
    </div>
  );
};
