"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ChevronRight, Home, ShieldCheck } from "lucide-react";

import { standardSellerQuestions, Question } from "@/data/seller-questions";

export default function SellerPortal() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, boolean | string | string[]>>({});
  const [isCompleted, setIsCompleted] = useState(false);
  const [dynamicQuestions, setDynamicQuestions] = useState<Question[]>(standardSellerQuestions);

  // Bemærk: I en ægte produktion vil vi hente dynamiske spørgsmål (fx om en BBR-garage) via API'et.
  
  const handleAnswer = (val: boolean | string | string[]) => {
    const question = dynamicQuestions[currentStep];
    setAnswers({ ...answers, [question.id]: val });
    
    if (currentStep < dynamicQuestions.length - 1) {
      setTimeout(() => setCurrentStep(prev => prev + 1), 400);
    } else {
      setTimeout(() => setIsCompleted(true), 400);
    }
  };

  if (isCompleted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-24 h-24 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-8"
        >
          <CheckCircle2 size={48} />
        </motion.div>
        <h2 className="text-4xl font-semibold tracking-tight mb-4">Tak for dine svar!</h2>
        <p className="text-lg text-white/60 max-w-md">
          Vi har sendt en kopi af dine besvarelser til din mægler, og vi er nu et skridt tættere på et trygt salg.
        </p>
      </div>
    );
  }

  const question = dynamicQuestions[currentStep];

  return (
    <div className="flex-1 flex flex-col p-8 max-w-4xl mx-auto w-full h-screen">
      <header className="flex justify-between items-center mb-16 mt-8">
        <div className="flex items-center gap-3 text-white/50">
          <Home size={24} />
          <span className="font-medium tracking-wide">Strandvejen 1, 2900 Hellerup</span>
        </div>
        <div className="flex gap-2">
          {dynamicQuestions.map((_, i) => (
            <div 
              key={i} 
              className={`h-2 rounded-full transition-all duration-500 ${i <= currentStep ? 'w-8 bg-indigo-500' : 'w-4 bg-white/10'}`} 
            />
          ))}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full relative min-h-[300px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex flex-col items-center text-center"
            >
              {question.aiGenerated && (
                <div className="mb-6 inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-300 rounded-full text-sm font-medium border border-indigo-500/30">
                  <ShieldCheck size={16} />
                  AI-genereret spørgsmål baseret på BBR
                </div>
              )}
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-16 leading-tight max-w-3xl">
                {question.text}
              </h2>
              
              <div className="flex gap-6 w-full max-w-md">
                <button 
                  onClick={() => handleAnswer(true)}
                  className={`flex-1 py-6 rounded-2xl border ${answers[question.id] === true ? 'bg-indigo-600 border-indigo-500' : 'bg-white/5 border-white/10 hover:bg-white/10'} transition-all text-xl font-medium`}
                >
                  Ja
                </button>
                <button 
                  onClick={() => handleAnswer(false)}
                  className={`flex-1 py-6 rounded-2xl border ${answers[question.id] === false ? 'bg-indigo-600 border-indigo-500' : 'bg-white/5 border-white/10 hover:bg-white/10'} transition-all text-xl font-medium`}
                >
                  Nej
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
