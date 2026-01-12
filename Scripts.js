/* ---------- MODALS ---------- */
const cards = document.querySelectorAll(".work-card");
const modals = document.querySelectorAll(".modal");
const closeBtns = document.querySelectorAll(".modal-close");

cards.forEach(card => {
  card.addEventListener("click", () => {
    const modal = document.getElementById(card.dataset.modal);
    modal.classList.add("active");
    document.body.classList.add("modal-open");
  });
});

closeBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    btn.closest(".modal").classList.remove("active");
    document.body.classList.remove("modal-open");
  });
});

modals.forEach(modal => {
  modal.addEventListener("click", e => {
    if (e.target === modal) {
      modal.classList.remove("active");
      document.body.classList.remove("modal-open");
    }
  });
});

/* ---------- FLUID BACKGROUND ---------- */
const canvas = document.getElementById("fluidCanvas");
const ctx = canvas.getContext("2d");

function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resize();
window.addEventListener("resize", resize);

let t = 0;
function blob(x,y,r,inner,outer){
  const g = ctx.createRadialGradient(x,y,r*0.25,x,y,r);
  g.addColorStop(0,inner);
  g.addColorStop(1,outer);
  return g;
}

function animate(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  t += 0.004;
  const cx = canvas.width/2;
  const cy = canvas.height/2;

  ctx.fillStyle = blob(
    cx + Math.sin(t)*180,
    cy + Math.cos(t*0.9)*140,
    canvas.width*0.9,
    "rgba(80,110,150,0.55)",
    "rgba(9,14,20,1)"
  );
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.globalCompositeOperation="lighter";
  ctx.fillStyle = blob(
    cx + Math.cos(t*1.2)*140,
    cy + Math.sin(t*1.1)*120,
    canvas.width*0.7,
    "rgba(90,130,160,0.4)",
    "rgba(9,14,20,0.9)"
  );
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.globalCompositeOperation="source-over";
  requestAnimationFrame(animate);
}
animate();
