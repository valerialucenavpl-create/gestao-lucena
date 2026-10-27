import React, { useEffect, useRef, useState } from "react";

// Card de comemoração "Meta batida!" com confetes caindo por cima da tela.
// Cada vendedora pode ter a arte dela em public/metas/<primeiro-nome>.jpg;
// quem não tiver arte ganha um card genérico montado aqui com o nome dela.

const CELEBRATION_IMAGES: Record<string, string> = {
  joyce: "/metas/joyce.jpg",
  itauane: "/metas/itauane.jpg",
};

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const firstName = (name: string) => normalize(name).split(/\s+/)[0] || "";

const CONFETTI_COLORS = ["#d4a537", "#f5d27a", "#b8860b", "#1e3a8a", "#2563eb", "#ffffff"];

type Piece = {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  tilt: number;
  vtilt: number;
  color: string;
};

const ConfettiCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const makePiece = (fromTop: boolean): Piece => ({
      x: Math.random() * canvas.width,
      y: fromTop ? -20 - Math.random() * canvas.height * 0.5 : Math.random() * canvas.height,
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 10,
      vx: -1.5 + Math.random() * 3,
      vy: 1.5 + Math.random() * 3,
      rot: Math.random() * Math.PI * 2,
      vrot: -0.15 + Math.random() * 0.3,
      tilt: Math.random() * Math.PI * 2,
      vtilt: 0.05 + Math.random() * 0.1,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    });

    const pieces: Piece[] = Array.from({ length: 180 }, () => makePiece(true));
    let frame = 0;

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx + Math.sin(p.tilt) * 0.8;
        p.y += p.vy;
        p.rot += p.vrot;
        p.tilt += p.vtilt;
        // Recicla quem saiu pela base — confete contínuo enquanto o card está aberto.
        if (p.y > canvas.height + 20) Object.assign(p, makePiece(true), { y: -20 });

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // "Achata" o papel conforme gira, dando o efeito de virar no ar.
        ctx.scale(1, Math.cos(p.tilt));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[61]" />;
};

const GenericCard: React.FC<{ name: string }> = ({ name }) => (
  <div className="w-[min(90vw,420px)] rounded-3xl bg-gradient-to-b from-white to-blue-50 px-8 py-10 text-center shadow-2xl ring-4 ring-amber-400/70">
    <p className="text-sm font-semibold tracking-[0.5em] text-blue-900">PARABÉNS</p>
    <div className="mx-auto my-3 h-0.5 w-16 bg-amber-500" />
    <p className="break-words text-5xl font-black uppercase text-blue-900">{firstName(name)}</p>
    <p className="mt-3 text-sm tracking-[0.3em] text-blue-900">POR MAIS ESSA</p>
    <p className="mt-2 text-6xl font-black text-blue-700 drop-shadow">META</p>
    <p className="-mt-1 font-serif text-4xl italic text-blue-950">batida!</p>
    <div className="mt-6 text-6xl">🏆</div>
    <p className="mt-6 text-sm text-blue-900">
      Seu empenho, profissionalismo e compromisso são fundamentais para o nosso crescimento.
      Continue assim, você faz parte dessa conquista!
    </p>
  </div>
);

type Props = {
  sellerName: string;
  onClose: () => void;
};

const MetaCelebration: React.FC<Props> = ({ sellerName, onClose }) => {
  const imageSrc = CELEBRATION_IMAGES[firstName(sellerName)];
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 animate-[metaFadeIn_.3s_ease-out]"
        onClick={onClose}
      >
        <div
          className="relative flex max-h-full flex-col items-center animate-[metaPop_.5s_cubic-bezier(.2,1.4,.4,1)]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute -right-3 -top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-xl font-bold text-gray-700 shadow-lg hover:bg-gray-100"
          >
            ×
          </button>
          {imageSrc && !imageFailed ? (
            <img
              src={imageSrc}
              alt={`Parabéns ${sellerName} — meta batida!`}
              onError={() => setImageFailed(true)}
              className="max-h-[88vh] w-auto rounded-2xl shadow-2xl"
            />
          ) : (
            <GenericCard name={sellerName} />
          )}
        </div>
      </div>
      <ConfettiCanvas />
      <style>{`
        @keyframes metaFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes metaPop { from { opacity: 0; transform: scale(.6) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </>
  );
};

export default MetaCelebration;
