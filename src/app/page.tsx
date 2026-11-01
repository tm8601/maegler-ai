"use client";

import { useState, useEffect, useRef } from "react";
import { Search, MapPin, CheckCircle2, FileText, Upload, ShieldCheck, Mail, FileDown, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getApiBaseUrl } from "@/lib/api";

interface DawaSuggestion {
  tekst: string;
  adresse: {
    id: string;
    href: string;
  };
}

export default function Home() {
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!address || address.length < 2) {
      setSuggestions([]);
      return;
    }

    const fetchAddress = async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/dawa?q=${encodeURIComponent(address)}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setSuggestions(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(fetchAddress, 300);
    return () => clearTimeout(debounce);
  }, [address]);

  const handleSelectAddress = (suggestion: DawaSuggestion) => {
    setAddress(suggestion.tekst);
    setShowSuggestions(false);
    setSelectedAddress(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setIsAnalyzing(true);
    setAnalysisResult(null);

    const formData = new FormData();
    formData.append('address', address);
    selectedFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/analyze`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysisResult(data.analysis);
      } else {
        alert(data.error || 'Fejl under analyse');
      }
    } catch (err) {
      console.error(err);
      alert('Der opstod en fejl under upload');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f7] p-6 lg:p-8 font-sans text-[#111827]">
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* TOP SEARCH BAR */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
          <label className="text-sm font-medium text-gray-500">Søg på en adresse for at starte</label>
          <div className="relative group" ref={wrapperRef}>
            <div className="flex items-center border border-gray-200 rounded-xl px-4 py-3 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <Search className="text-gray-400 mr-3" size={20} />
              <input 
                type="text" 
                className="flex-1 outline-none text-base placeholder:text-gray-400"
                placeholder="F.eks. Kløvertoften 3, 7100 Vejle"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              {selectedAddress && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full border border-green-100">
                  <CheckCircle2 size={14} />
                  <span>Data verificeret</span>
                </div>
              )}
            </div>

            <AnimatePresence>
              {showSuggestions && suggestions.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-xl z-50 max-h-[300px] overflow-y-auto"
                >
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-3 transition-colors text-gray-700"
                      onClick={() => handleSelectAddress(suggestion)}
                    >
                      <MapPin size={18} className="text-blue-500 flex-shrink-0" />
                      <span className="truncate">{suggestion.tekst}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {selectedAddress && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT COLUMN (2/3 width) */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* IMAGE / MAP PLACEHOLDER */}
              <div className="bg-gray-200 rounded-2xl h-[300px] overflow-hidden relative shadow-sm border border-gray-100">
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <MapPin size={48} className="mx-auto mb-2 opacity-50" />
                    <p className="font-medium">Skråfoto / Kortvisning</p>
                  </div>
                </div>
              </div>

              {/* AI KRYDSREVISION CARD */}
              <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                <div className="mb-6">
                  <h2 className="text-2xl font-semibold mb-1">AI Krydsrevision</h2>
                  <p className="text-gray-500 text-sm">Upload dokumenter for at lade Bolighandel-GPT analysere sagen.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                  {[
                    { title: "BBR Register", status: "Hentet", type: "success" },
                    { title: "Tingbog", status: "Mangler", type: "warning" },
                    { title: "Byggesager", status: "Mangler", type: "warning" },
                    { title: "Sælgerskema", status: "Afventer", type: "neutral" },
                  ].map((item, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                      <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">{item.title}</p>
                      <p className={`text-lg font-medium ${item.type === 'success' ? 'text-green-600' : item.type === 'warning' ? 'text-orange-500' : 'text-blue-500'}`}>
                        {item.status}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-1 flex items-center gap-2">
                      <ShieldCheck size={20} className="text-blue-600" />
                      Klar til analyse
                    </h3>
                    <p className="text-blue-800/70 text-sm">Upload byggesager (PDF) eller tegninger for at starte det visuelle "pixel-for-pixel" tjek og udarbejdelse af afsnit 11.</p>
                  </div>
                  
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    multiple 
                    className="hidden" 
                    accept="application/pdf,image/*" 
                  />
                  
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className="whitespace-nowrap bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-sm flex items-center gap-2"
                  >
                    {isAnalyzing ? (
                      <span className="animate-pulse">Analyserer...</span>
                    ) : (
                      <>
                        <Upload size={18} />
                        Upload filer
                      </>
                    )}
                  </button>
                </div>

                {analysisResult && (
                  <div className="mt-8 border-t border-gray-100 pt-8">
                    <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                      <ShieldCheck className="text-green-500" />
                      AI Analyserapport
                    </h3>
                    <div className="prose prose-sm max-w-none text-gray-700 bg-gray-50 p-6 rounded-xl border border-gray-200">
                      <pre className="whitespace-pre-wrap font-sans">{analysisResult}</pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN (1/3 width) */}
            <div className="space-y-6">
              
              {/* BBR DATA CARD */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-bold text-lg mb-6">Ejendomsdata (BBR)</h3>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">BBR registreret tag:</p>
                    <p className="font-medium">Betontagsten</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Opførelsesår:</p>
                    <p className="font-medium">2003</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Boligareal:</p>
                    <p className="font-medium">171 m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Bebygget areal:</p>
                    <p className="font-medium">215 m²</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Ydervægsmateriale:</p>
                    <p className="font-medium">Mursten</p>
                  </div>
                </div>
              </div>

              {/* ACTION CARD (SEND TIL SÆLGER) */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <h3 className="font-bold text-lg mb-6">Handling</h3>
                
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">Send det dynamiske sælgeroplysningsskema direkte til sælgeren for at indhente oplysninger.</p>
                  
                  <div className="flex flex-col gap-3">
                    <input 
                      type="text" 
                      placeholder="Sælgers navn"
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-colors"
                    />
                    <input 
                      type="email" 
                      placeholder="Sælgers e-mailadresse"
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:border-blue-500 outline-none transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button className="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors">
                      <Eye size={16} />
                      Preview
                    </button>
                    <button className="flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors shadow-sm">
                      <Mail size={16} />
                      Send link
                    </button>
                  </div>

                  <button className="w-full mt-2 flex items-center justify-center gap-2 border border-gray-200 text-gray-700 hover:bg-gray-50 px-4 py-2.5 rounded-lg font-medium text-sm transition-colors">
                    <FileDown size={16} />
                    Download PDF
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
