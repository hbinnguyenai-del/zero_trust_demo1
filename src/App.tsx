import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Server, Cpu, Laptop, Play, StepForward, RotateCcw, ChevronRight, Mic, Pause } from 'lucide-react';

const positions = {
  Pub: { top: '60%', left: '15%' },
  Broker: { top: '60%', left: '50%' },
  PDP: { top: '20%', left: '50%' },
  Sub: { top: '60%', left: '85%' },
};

const cases = [
  {
    id: 1,
    title: "Case 1: Missing Certificate",
    summary: "A publisher attempts to connect without a valid TLS certificate. The Zero Trust architecture denies the connection at the edge.",
    snippet: "$ mosquitto_pub -h broker.example.com -t 'data' -m 'hello'\nError: Connection Refused: Not authorized",
    speakerText: "In this scenario, a device tries to connect but lacks the required cryptographic identity. The Policy Decision Point immediately rejects the request, and the Broker drops the connection before any data is processed.",
    steps: [
      { log: "Ready. Waiting for publisher to connect.", nodeStatus: {} },
      { log: "Publisher attempts connection without certificate", packet: { from: 'Pub', to: 'Broker', status: 'neutral', label: 'Connect' }, nodeStatus: {} },
      { log: "Broker requests authentication decision from PDP", packet: { from: 'Broker', to: 'PDP', status: 'neutral', label: 'Auth Check' }, nodeStatus: {} },
      { log: "PDP rejects authentication (No Certificate)", packet: { from: 'PDP', to: 'Broker', status: 'denied', label: 'Deny' }, nodeStatus: { PDP: 'denied' } },
      { log: "Broker denies connection. Subscriber receives nothing.", packet: { from: 'Broker', to: 'Pub', status: 'denied', label: 'Reject' }, nodeStatus: { PDP: 'denied', Pub: 'denied', Broker: 'denied' } }
    ]
  },
  {
    id: 2,
    title: "Case 2: Unauthorized Topic",
    summary: "An authenticated publisher tries to send a message to a topic it doesn't have permission to write to.",
    snippet: "$ mosquitto_pub --cert cert.pem -t 'device/2/tx' -m 'cmd'\nError: Publish Denied",
    speakerText: "Here, the device is authenticated, but it tries to publish to another device's topic. Zero Trust means identity isn't enough; every action is authorized. The PDP blocks this specific publish action.",
    steps: [
      { log: "Publisher connects successfully with certificate", nodeStatus: { Pub: 'allowed' } },
      { log: "Publisher sends message to unauthorized topic 'device/2/tx'", packet: { from: 'Pub', to: 'Broker', status: 'neutral', label: 'Publish' }, nodeStatus: { Pub: 'allowed' } },
      { log: "Broker requests authorization decision from PDP", packet: { from: 'Broker', to: 'PDP', status: 'neutral', label: 'Authz Check' }, nodeStatus: { Pub: 'allowed' } },
      { log: "PDP rejects authorization (Unauthorized Topic)", packet: { from: 'PDP', to: 'Broker', status: 'denied', label: 'Deny' }, nodeStatus: { Pub: 'allowed', PDP: 'denied' } },
      { log: "Broker blocks publish. Subscriber receives nothing.", packet: { from: 'Broker', to: 'Pub', status: 'denied', label: 'Blocked' }, nodeStatus: { Pub: 'allowed', PDP: 'denied', Broker: 'denied' } }
    ]
  },
  {
    id: 3,
    title: "Case 3: Rate Limit Exceeded",
    summary: "An authenticated and authorized publisher exceeds its allowed message rate (5 messages / 5 seconds).",
    snippet: "$ for i in {1..6}; do mosquitto_pub -t 'my/topic' -m 'data'; done\nError: Rate limit exceeded. Disconnected.",
    speakerText: "Even trusted devices can be compromised or malfunction. By enforcing rate limits, the PDP detects anomalous behavior (too many messages) and instructs the Broker to sever the connection to protect the system.",
    steps: [
      { log: "Publisher is connected and authorized", nodeStatus: { Pub: 'allowed' } },
      { log: "Publisher sends 5 messages rapidly", packet: { from: 'Pub', to: 'Broker', status: 'allowed', label: '5x Publish' }, nodeStatus: { Pub: 'allowed' } },
      { log: "Broker forwards 5 messages to Subscriber", packet: { from: 'Broker', to: 'Sub', status: 'allowed', label: '5x Deliver' }, nodeStatus: { Pub: 'allowed', Sub: 'allowed' } },
      { log: "Publisher sends 6th message", packet: { from: 'Pub', to: 'Broker', status: 'warning', label: 'Publish (6th)' }, nodeStatus: { Pub: 'allowed', Sub: 'allowed' } },
      { log: "Broker requests authorization from PDP", packet: { from: 'Broker', to: 'PDP', status: 'neutral', label: 'Authz Check' }, nodeStatus: { Pub: 'allowed', Sub: 'allowed' } },
      { log: "PDP detects rate limit exceeded (5 msgs/5s)", packet: { from: 'PDP', to: 'Broker', status: 'denied', label: 'Limit Exceeded' }, nodeStatus: { Pub: 'allowed', Sub: 'allowed', PDP: 'denied' } },
      { log: "Broker disconnects Publisher", packet: { from: 'Broker', to: 'Pub', status: 'denied', label: 'Disconnect' }, nodeStatus: { Pub: 'denied', Sub: 'allowed', PDP: 'denied', Broker: 'denied' } }
    ]
  }
];

const getPacketColor = (status: string) => {
  switch (status) {
    case 'allowed': return 'bg-emerald-500';
    case 'denied': return 'bg-rose-500';
    case 'warning': return 'bg-amber-500';
    default: return 'bg-slate-500';
  }
};

const Node = ({ type, icon: Icon, position, status }: any) => {
  const bgColors: Record<string, string> = {
    neutral: 'bg-slate-500',
    allowed: 'bg-emerald-500',
    denied: 'bg-rose-500',
    warning: 'bg-amber-500'
  };
  const bgColor = bgColors[status || 'neutral'];

  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-0" style={position}>
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-colors duration-500 ${bgColor}`}>
        <Icon className="w-8 h-8 text-white" />
      </div>
      <span className="mt-3 font-bold text-sm text-slate-700 bg-white/80 px-2 py-0.5 rounded backdrop-blur-sm whitespace-nowrap">{type}</span>
    </div>
  );
};

export default function App() {
  const [activeCase, setActiveCase] = useState(1);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const currentCaseData = cases[activeCase - 1];
  const currentStepData = currentCaseData.steps[currentStep];
  const nodeStatus = currentStepData.nodeStatus || {};
  const packet = currentStepData.packet || null;
  const logs = currentCaseData.steps.slice(0, currentStep + 1).map(s => s.log);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isPlaying && currentStep < currentCaseData.steps.length - 1) {
      timer = setTimeout(() => {
        setCurrentStep(s => s + 1);
      }, 1500);
    } else if (currentStep >= currentCaseData.steps.length - 1) {
      setIsPlaying(false);
    }
    return () => clearTimeout(timer);
  }, [isPlaying, currentStep, currentCaseData]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentStep, activeCase]);

  const selectCase = (id: number) => {
    setActiveCase(id);
    setCurrentStep(0);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (currentStep >= currentCaseData.steps.length - 1) {
      setCurrentStep(0);
      setTimeout(() => setIsPlaying(true), 100);
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  const nextStep = () => {
    setIsPlaying(false);
    if (currentStep < currentCaseData.steps.length - 1) {
      setCurrentStep(s => s + 1);
    }
  };

  const reset = () => {
    setIsPlaying(false);
    setCurrentStep(0);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-800">Zero Trust MQTT Demo</h1>
          <p className="text-slate-600 mt-2">Interactive visualization of authentication, authorization, and rate limiting</p>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column: Architecture & Legend */}
          <div className="xl:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold mb-4">Architecture Flow</h2>
              <div className="relative w-full h-80 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                {/* SVG Lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                  <line x1="15%" y1="60%" x2="50%" y2="60%" stroke="#cbd5e1" strokeWidth="3" strokeDasharray="6" />
                  <line x1="50%" y1="60%" x2="85%" y2="60%" stroke="#cbd5e1" strokeWidth="3" strokeDasharray="6" />
                  <line x1="50%" y1="60%" x2="50%" y2="20%" stroke="#cbd5e1" strokeWidth="3" strokeDasharray="6" />
                </svg>
                
                {/* Nodes */}
                <Node type="PDP" icon={ShieldCheck} position={positions.PDP} status={nodeStatus.PDP} />
                <Node type="Broker / PEP" icon={Server} position={positions.Broker} status={nodeStatus.Broker} />
                <Node type="Publisher" icon={Cpu} position={positions.Pub} status={nodeStatus.Pub} />
                <Node type="Subscriber" icon={Laptop} position={positions.Sub} status={nodeStatus.Sub} />

                {/* Packet */}
                {packet && (
                  <motion.div
                    key={`${activeCase}-${currentStep}`}
                    initial={positions[packet.from as keyof typeof positions]}
                    animate={positions[packet.to as keyof typeof positions]}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-md whitespace-nowrap z-10 ${getPacketColor(packet.status)}`}
                  >
                    {packet.label}
                  </motion.div>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-6 text-sm">
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-slate-500"></div> Neutral</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-emerald-500"></div> Allowed / Success</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-rose-500"></div> Denied / Blocked</div>
              <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-amber-500"></div> Warning</div>
            </div>
          </div>

          {/* Right Column: Controls & Details */}
          <div className="space-y-6">
            {/* Case Selector */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-2">
              {cases.map(c => (
                <button 
                  key={c.id}
                  onClick={() => selectCase(c.id)}
                  className={`px-4 py-3 rounded-xl text-left font-medium transition-colors ${activeCase === c.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-600 border border-transparent hover:bg-slate-100'}`}
                >
                  {c.title}
                </button>
              ))}
            </div>

            {/* Case Details */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[520px]">
              <h3 className="text-lg font-bold text-slate-800 mb-2">{currentCaseData.title}</h3>
              <p className="text-sm text-slate-600 mb-4">{currentCaseData.summary}</p>
              
              <div className="bg-slate-900 text-slate-300 p-3 rounded-lg text-xs font-mono mb-4 whitespace-pre-wrap">
                {currentCaseData.snippet}
              </div>

              {/* Controls */}
              <div className="flex gap-2 mb-4">
                <button onClick={togglePlay} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors">
                  {isPlaying ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Play</>}
                </button>
                <button onClick={nextStep} disabled={currentStep >= currentCaseData.steps.length - 1} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                  <StepForward className="w-4 h-4" /> Next
                </button>
                <button onClick={reset} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-2 rounded-lg font-medium flex items-center justify-center transition-colors">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

              {/* Progress */}
              <div className="w-full bg-slate-100 h-2 rounded-full mb-4 overflow-hidden shrink-0">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-300" 
                  style={{ width: `${(currentStep / (currentCaseData.steps.length - 1)) * 100}%` }}
                ></div>
              </div>

              {/* Logs */}
              <div className="flex-1 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className={`text-sm flex items-start gap-2 ${i === logs.length - 1 ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                    <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{log}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          </div>
        </div>

        {/* Speaker Notes */}
        <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
          <h4 className="text-indigo-800 font-semibold mb-2 flex items-center gap-2">
            <Mic className="w-5 h-5" /> Speaker Notes
          </h4>
          <p className="text-indigo-900/80 leading-relaxed">
            {currentCaseData.speakerText}
          </p>
        </div>
      </div>
    </div>
  );
}
