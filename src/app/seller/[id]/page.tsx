"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Home, ShieldCheck, ArrowLeft, ArrowRight, FileCheck2 } from "lucide-react";
import { standardSellerQuestions, Question } from "@/data/seller-questions";
import { getApiBaseUrl } from "@/lib/api";

export default function SellerPortal() {
  const params = useParams();
  const caseId = String(params?.id || "default");

  const [address, setAddress] = useState("Indlæser ejendom...");
  const [sellerName, setSellerName] = useState("Sælger");
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean | string | string[]>>({});
  const [followUpNotes, setFollowUpNotes] = useState<Record<string, string>>({});
  const [showFollowUpFor, setShowFollowUpFor] = useState<string | null>(null);
  const [selectedMulti, setSelectedMulti] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedClauses, setGeneratedClauses] = useState<string[]>([]);
  const [dynamicQuestions, setDynamicQuestions] = useState<Question[]>(standardSellerQuestions);

  useEffect(() => {
    const loadCase = async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/cases?id=${encodeURIComponent(caseId)}`);
        if (res.ok) {
          const data = await res.json();
          setAddress(data.address || "H C Hansens Vej 29, 7100 Vejle");
          if (data.sellerName) setSellerName(data.sellerName);
          if (Array.isArray(data.dynamicQuestions) && data.dynamicQuestions.length > 0) {
            setDynamicQuestions(data.dynamicQuestions);
          }
          if (data.answers) setAnswers(data.answers);
          if (data.followUpNotes) setFollowUpNotes(data.followUpNotes);
        } else {
          setAddress("H C Hansens Vej 29, 7100 Vejle");
        }
      } catch (e) {
        console.error("Failed to load seller case:", e);
        setAddress("H C Hansens Vej 29, 7100 Vejle");
      }
    };
    loadCase();
  }, [caseId]);

  useEffect(() => {
    const q = dynamicQuestions[currentStep];
    if (!q) return;
    const existingAns = answers[q.id];
    if (Array.isArray(existingAns)) {
      setSelectedMulti(existingAns);
    } else {
      setSelectedMulti([]);
    }
    if (typeof existingAns === "string") {
      setTextAnswer(existingAns);
    } else {
      setTextAnswer("");
    }
  }, [currentStep, dynamicQuestions, answers]);

  const finishAndSave = async (
    nextAnswers: Record<string, boolean | string | string[]>,
    nextNotes: Record<string, string>
  ) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/cases`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: caseId,
          answers: nextAnswers,
          followUpNotes: nextNotes,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (Array.isArray(updated.generatedAfsnit11Clauses)) {
          setGeneratedClauses(updated.generatedAfsnit11Clauses);
        }
      }
    } catch (e) {
      console.error("Error saving seller answers:", e);
    } finally {
      setIsSaving(false);
      setIsCompleted(true);
    }
  };

  const advanceStep = (nextAnswers: Record<string, boolean | string | string[]>, nextNotes: Record<string, string>) => {
    setShowFollowUpFor(null);
    setSelectedMulti([]);
    if (currentStep < dynamicQuestions.length - 1) {
      setTimeout(() => setCurrentStep((prev) => prev + 1), 250);
    } else {
      finishAndSave(nextAnswers, nextNotes);
    }
  };

  const handleBooleanAnswer = (val: boolean) => {
    const question = dynamicQuestions[currentStep];
    const nextAnswers = { ...answers, [question.id]: val };
    setAnswers(nextAnswers);

    if (val === true && question.followUpIfTrue) {
      setShowFollowUpFor(question.id);
      return;
    }

    advanceStep(nextAnswers, followUpNotes);
  };

  const handleMultiSubmit = () => {
    const question = dynamicQuestions[currentStep];
    const nextAnswers = { ...answers, [question.id]: selectedMulti };
    setAnswers(nextAnswers);
    advanceStep(nextAnswers, followUpNotes);
  };

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-[#0f172a] text-white flex flex-col items-center justify-center p-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-8 border border-emerald-500/30"
        >
          <CheckCircle2 size={48} />
        </motion.div>
        <h2 className="text-4xl font-semibold tracking-tight mb-4">Tak for dine svar, {sellerName}!</h2>
        <p className="text-lg text-slate-300 max-w-xl mb-8">
          Dine besvarelser for <strong>{address}</strong> er nu registreret og synkroniseret direkte med mæglerens
          sagsmappe og udkast til købsaftalens Afsnit 11.
        </p>

        {generatedClauses.length > 0 && (
          <div className="max-w-2xl w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 text-left mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-2">
              <FileCheck2 size={16} />
              Genererede Afsnit 11-forbehold til mægleren:
            </h3>
            <div className="space-y-3 text-sm text-slate-300">
              {generatedClauses.map((clause, i) => (
                <div key={i} className="p-3 bg-slate-800/70 rounded-xl border border-slate-700/60">
                  {clause}
                </div>
              ))}
            </div>
          </div>
        )}

        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
        >
          <ArrowLeft size={18} />
          Tilbage til Mægler Dashboard
        </a>
      </div>
    );
  }

  const question = dynamicQuestions[currentStep] || standardSellerQuestions[0];

  return (
    <div className="min-h-screen bg-[#0f172a] text-white flex flex-col p-6 md:p-10">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-12 mt-4">
          <div className="flex items-center gap-3 text-slate-300">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Home size={20} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400">Digitalt Sælgeroplysningsskema</p>
              <p className="font-semibold text-white">{address}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 mr-2">
              Spørgsmål {currentStep + 1} af {dynamicQuestions.length}
            </span>
            {currentStep > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowFollowUpFor(null);
                  setCurrentStep((prev) => Math.max(0, prev - 1));
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-slate-200 mr-2 cursor-pointer"
              >
                <ArrowLeft size={12} />
                Forrige
              </button>
            )}
            <div className="flex gap-1.5">
              {dynamicQuestions.map((q, i) => (
                <div
                  key={q.id || i}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? "w-7 bg-indigo-500"
                      : i < currentStep
                      ? "w-3 bg-emerald-500/70"
                      : "w-2.5 bg-white/10"
                  }`}
                />
              ))}
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full relative min-h-[360px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={question.id || currentStep}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className=" flex flex-col items-center text-center"
              >
                <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
                  <span className="px-3.5 py-1.5 bg-white/5 text-slate-300 rounded-full text-xs font-medium border border-white/10">
                    {question.category}
                  </span>
                  {question.aiGenerated && (
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-medium border border-indigo-500/30">
                      <ShieldCheck size={14} />
                      Genereret ud fra BBR / Byggesag / Plandata krydstjek
                    </span>
                  )}
                </div>

                <h2 className="text-2xl md:text-4xl font-medium tracking-tight mb-12 leading-snug max-w-3xl">
                  {question.text}
                </h2>

                {question.type === "text" ? (
                  <div className="w-full max-w-xl space-y-4">
                    <textarea
                      rows={3}
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      placeholder="Skriv dit svar her..."
                      className="w-full rounded-xl bg-slate-800 border border-slate-700 p-4 text-sm text-white outline-none focus:border-indigo-400"
                    />
                    <button
                      onClick={() => {
                        const nextAnswers = { ...answers, [question.id]: textAnswer };
                        setAnswers(nextAnswers);
                        advanceStep(nextAnswers, followUpNotes);
                      }}
                      disabled={isSaving}
                      className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      Næste spørgsmål
                      <ArrowRight size={18} />
                    </button>
                  </div>
                ) : question.type === "multiselect" && question.options ? (
                  <div className="w-full max-w-xl space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {question.options.map((opt) => {
                        const active = selectedMulti.includes(opt);
                        return (
                          <button
                            key={opt}
                            onClick={() =>
                              setSelectedMulti((prev) =>
                                prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                              )
                            }
                            className={`py-4 px-4 rounded-xl border text-left font-medium transition-all ${
                              active
                                ? "bg-indigo-600 border-indigo-400 text-white"
                                : "bg-white/5 border-white/10 text-slate-200 hover:bg-white/10"
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={handleMultiSubmit}
                      disabled={selectedMulti.length === 0 || isSaving}
                      className="w-full py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                      Næste spørgsmål
                      <ArrowRight size={18} />
                    </button>
                  </div>
                ) : (
                  <div className="w-full max-w-lg space-y-6">
                    <div className="flex gap-5 w-full">
                      <button
                        onClick={() => handleBooleanAnswer(true)}
                        disabled={isSaving}
                        className={`flex-1 py-6 rounded-2xl border ${
                          answers[question.id] === true
                            ? "bg-indigo-600 border-indigo-400"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        } transition-all text-xl font-medium`}
                      >
                        Ja
                      </button>
                      <button
                        onClick={() => handleBooleanAnswer(false)}
                        disabled={isSaving}
                        className={`flex-1 py-6 rounded-2xl border ${
                          answers[question.id] === false
                            ? "bg-indigo-600 border-indigo-400"
                            : "bg-white/5 border-white/10 hover:bg-white/10"
                        } transition-all text-xl font-medium`}
                      >
                        Nej
                      </button>
                    </div>

                    {showFollowUpFor === question.id && question.followUpIfTrue && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-slate-900/90 border border-indigo-500/40 rounded-2xl p-5 text-left space-y-3"
                      >
                        <label className="block text-sm font-medium text-indigo-300">{question.followUpIfTrue}</label>
                        <textarea
                          rows={3}
                          value={followUpNotes[question.id] || ""}
                          onChange={(e) => setFollowUpNotes({ ...followUpNotes, [question.id]: e.target.value })}
                          placeholder="Skriv din uddybning her (bruges til at beskytte dig i købsaftalens Afsnit 11)..."
                          className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3 text-sm text-white outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={() => advanceStep(answers, followUpNotes)}
                          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                          Gem bemærkning og fortsæt
                          <ArrowRight size={16} />
                        </button>
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
