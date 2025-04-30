// React + Tone.js rap cadence builder (responsive/mobile-friendly)
import { useEffect, useState, useRef } from 'react';
import * as Tone from 'tone';
import WaveSurfer from 'wavesurfer.js';
import { saveAs } from 'file-saver';
import './styles.css';

const defaultNoteTypes = [
  { type: 'quarter', label: '1/4', duration: '4n', file: '/sounds/Boom.mp3' },
  { type: 'eighth', label: '1/8', duration: '8n', file: '/sounds/Ka.mp3' },
  { type: 'sixteenth', label: '1/16', duration: '16n', file: '/sounds/Ta.mp3' },
  { type: 'triplet', label: 'Triplet', duration: '8t', file: '/sounds/Digga.mp3' },
  { type: 'thirtysecond', label: '1/32', duration: '32n', file: '/sounds/Tuh.mp3' },
  { type: 'pause', label: 'Pause', duration: null, file: null }
];

export default function CadenceBuilder() {
  const [bars, setBars] = useState(4);
  const [bpm, setBpm] = useState(90);
  const [grid, setGrid] = useState(Array(128).fill({ note: null, vol: 0, pan: 0 }));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [noteTypes, setNoteTypes] = useState(defaultNoteTypes);
  const waveformRefs = useRef([]);
  const [metronomeOn, setMetronomeOn] = useState(true);
  const metronomeSound = new Tone.MembraneSynth().toDestination();
  const [savedProjects, setSavedProjects] = useState(() => {
    const projects = localStorage.getItem('cadenceProjects');
    return projects ? JSON.parse(projects) : {};
  });
  const [projectName, setProjectName] = useState('');
  const [theme, setTheme] = useState('light');
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  const stepsPerBar = 32;
  const totalSteps = bars * stepsPerBar;

  useEffect(() => {
    Tone.Transport.bpm.value = bpm;
  }, [bpm]);

  useEffect(() => {
    noteTypes.forEach((note, idx) => {
      if (note.file && waveformRefs.current[idx]) {
        const wavesurfer = WaveSurfer.create({
          container: waveformRefs.current[idx],
          waveColor: '#ccc',
          progressColor: '#999',
          height: 30,
          barWidth: 1,
          interact: false
        });
        wavesurfer.load(note.file);
      }
    });
  }, [noteTypes]);

  useEffect(() => {
    setGrid(prev => {
      const next = Array(totalSteps).fill({ note: null, vol: 0, pan: 0 });
      for (let i = 0; i < Math.min(prev.length, next.length); i++) {
        next[i] = prev[i];
      }
      return next;
    });
  }, [bars]);

  const handleCustomUpload = (event, index) => {
    const file = event.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const updated = [...noteTypes];
    updated[index] = { ...updated[index], file: url };
    setNoteTypes(updated);
  };

  const playSequence = async () => {
    await Tone.start();
    Tone.Transport.cancel();
    Tone.Transport.stop();

    grid.forEach((cell, index) => {
      const noteType = noteTypes.find(n => (n.duration === cell.note || (cell.note === 'pause' && n.type === 'pause')));
      if (noteType && noteType.file) {
        Tone.Transport.schedule(time => {
          const player = new Tone.Player(noteType.file);
          const panner = new Tone.Panner(cell.pan).toDestination();
          const gain = new Tone.Gain(Math.pow(10, cell.vol / 20)).connect(panner);
          player.connect(gain);
          player.start(time);
        }, `0:0:${index}`);
      }
    });

    if (metronomeOn) {
      for (let i = 0; i < totalSteps; i += 8) {
        Tone.Transport.schedule(time => {
          metronomeSound.triggerAttackRelease('C3', '8n', time);
        }, `0:0:${i}`);
      }
    }

    Tone.Transport.scheduleRepeat(() => {
      setCurrentStep(step => (step + 1) % totalSteps);
    }, '32n');

    Tone.Transport.start();
    setIsPlaying(true);
  };

  const stopSequence = () => {
    Tone.Transport.stop();
    setIsPlaying(false);
    setCurrentStep(-1);
  };

  const updateGrid = (index, field, value) => {
    const newGrid = [...grid];
    newGrid[index] = { ...newGrid[index], [field]: value };
    setHistory([...history, grid]);
    setFuture([]);
    setGrid(newGrid);
  };

  const exportJSON = () => {
    const data = { bpm, bars, grid };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveAs(blob, 'cadence.json');
  };

  const importJSON = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (Array.isArray(data.grid) && typeof data.bpm === 'number' && typeof data.bars === 'number') {
          setGrid(data.grid);
          setBpm(data.bpm);
          setBars(data.bars);
        } else {
          alert('Invalid JSON structure.');
        }
      } catch (err) {
        alert('Error reading file.');
      }
    };
    reader.readAsText(file);
  };

  const exportAudio = async () => {
    const duration = Tone.Time(`${totalSteps} * 32n`).toSeconds();

    await Tone.Offline(async () => {
      Tone.Transport.bpm.value = bpm;

      grid.forEach((cell, index) => {
        const noteType = noteTypes.find(n => (n.duration === cell.note || (cell.note === 'pause' && n.type === 'pause')));
        if (noteType && noteType.file) {
          const player = new Tone.Player(noteType.file);
          const panner = new Tone.Panner(cell.pan).toDestination();
          const gain = new Tone.Gain(Math.pow(10, cell.vol / 20)).connect(panner);
          player.connect(gain);
          player.start(`0:0:${index}`);
        }
      });

      Tone.Transport.start();
    }, duration).then(buffer => {
      const audioBuffer = buffer.get();
      const wav = Tone.Buffer.toWav(audioBuffer);
      const blob = new Blob([wav], { type: 'audio/wav' });
      saveAs(blob, 'cadence.wav');
    });
  };

  const saveProject = () => {
    if (!projectName) return alert('Enter a name for your project.');
    const updated = { ...savedProjects, [projectName]: { bpm, bars, grid } };
    setSavedProjects(updated);
    localStorage.setItem('cadenceProjects', JSON.stringify(updated));
  };

  const loadProject = (name) => {
    const data = savedProjects[name];
    if (data) {
      setGrid(data.grid);
      setBpm(data.bpm);
      setBars(data.bars);
      setProjectName(name);
    }
  };

  return (
    <div className={`p-4 ${theme === 'dark' ? 'bg-black text-white' : 'bg-white text-black'}`}>
      <div className="mb-4">
        <label className="mr-2">Theme:</label>
        <select value={theme} onChange={e => setTheme(e.target.value)} className="border px-2 py-1">
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>

      <div className="mb-4">
        <button onClick={() => {
          if (history.length === 0) return;
          const prev = history[history.length - 1];
          setFuture([grid, ...future]);
          setGrid(prev);
          setHistory(history.slice(0, -1));
        }} className="bg-gray-300 px-2 py-1 rounded mr-2">Undo</button>

        <button onClick={() => {
          if (future.length === 0) return;
          const next = future[0];
          setHistory([...history, grid]);
          setGrid(next);
          setFuture(future.slice(1));
        }} className="bg-gray-300 px-2 py-1 rounded">Redo</button>
      </div>

      <h1 className="text-xl font-bold mb-4">Rap Cadence Builder</h1>

      <div className="mb-4">
        <label className="mr-2">Bars:</label>
        <select value={bars} onChange={e => setBars(Number(e.target.value))} className="border px-2 py-1">
          {[...Array(16)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>
      </div>

      <div className="mb-4">
        <label className="mr-2">Metronome:</label>
        <input type="checkbox" checked={metronomeOn} onChange={() => setMetronomeOn(!metronomeOn)} />
      </div>

      <div className="mb-4">
        <label className="mr-2">Project Name:</label>
        <input value={projectName} onChange={e => setProjectName(e.target.value)} className="border px-2 py-1 mr-2" placeholder="My Flow" />
        <button onClick={saveProject} className="bg-yellow-500 text-white px-4 py-2 rounded">Save Project</button>
        <select onChange={e => loadProject(e.target.value)} className="ml-4 border px-2 py-1">
          <option value="">-- Load Project --</option>
          {Object.keys(savedProjects).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${totalSteps}, minmax(2rem, 1fr))` }}>
          {grid.map((cell, i) => (
            <div key={i} className={`border h-44 min-w-[3rem] flex flex-col items-center justify-start ${currentStep === i ? 'bg-yellow-300' : ''}`}>
              <select value={cell.note || ''} onChange={e => updateGrid(i, 'note', e.target.value)} className="text-xs w-full">
                <option value="">--</option>
                {noteTypes.map(n => (
                  <option key={n.type} value={n.duration || 'pause'}>{n.label}</option>
                ))}
              </select>
              <input type="range" min="-20" max="0" step="1" value={cell.vol} onChange={e => updateGrid(i, 'vol', parseInt(e.target.value))} className="w-full mt-1" />
              <input type="range" min="-1" max="1" step="0.1" value={cell.pan} onChange={e => updateGrid(i, 'pan', parseFloat(e.target.value))} className="w-full" />
              <span className="text-xs">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="text-md font-semibold mb-2 mt-6">Waveform Previews & Custom Uploads</h2>
      <div className="grid grid-cols-5 gap-4 mb-4">
        {noteTypes.map((n, idx) => (
          <div key={n.type}>
            <div className="text-xs text-center mb-1">{n.label}</div>
            <div ref={el => waveformRefs.current[idx] = el} className="w-full bg-gray-200"></div>
            {n.type !== 'pause' && (
              <input type="file" accept="audio/*" onChange={e => handleCustomUpload(e, idx)} className="mt-1 text-xs" />
            )}
          </div>
        ))}
      </div>

      <div className="mb-4">
        <label className="mr-2">BPM:</label>
        <input type="number" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="border px-2 py-1 w-20" />
      </div>

      <div className="space-x-2 mb-4">
        <button onClick={playSequence} disabled={isPlaying} className="bg-green-500 text-white px-4 py-2 rounded">Play</button>
        <button onClick={stopSequence} disabled={!isPlaying} className="bg-red-500 text-white px-4 py-2 rounded">Stop</button>
        <button onClick={exportJSON} className="bg-blue-500 text-white px-4 py-2 rounded">Export JSON</button>
        <input type="file" accept="application/json" onChange={importJSON} className="border px-2 py-1 rounded" />
        <button onClick={exportAudio} className="bg-purple-600 text-white px-4 py-2 rounded">Export Audio (WAV)</button>
      </div>
    </div>
  );
}
