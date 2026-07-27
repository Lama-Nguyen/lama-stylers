export function ToastContainer({ toasts, onRemove }) {
  if (!toasts?.length) return null
  return (
    <div style={{ position:'fixed', bottom:80, right:16, zIndex:9999, display:'flex', flexDirection:'column', gap:8, maxWidth:320, width:'calc(100vw - 32px)' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? '#EF4444' : t.type === 'warning' ? '#F59E0B' : '#10B981',
          color:'#fff', padding:'12px 14px', borderRadius:10,
          display:'flex', justifyContent:'space-between', alignItems:'center', gap:10,
          boxShadow:'0 4px 12px rgba(0,0,0,0.3)',
          animation:'tsSlide 0.25s ease-out',
        }}>
          <span style={{ flex:1, fontSize:13, lineHeight:1.4 }}>{t.message}</span>
          <button onClick={() => onRemove(t.id)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.8)', cursor:'pointer', fontSize:16, padding:'0 2px', lineHeight:1 }}>✕</button>
        </div>
      ))}
      <style>{`@keyframes tsSlide { from { transform:translateX(120%);opacity:0 } to { transform:none;opacity:1 } }`}</style>
    </div>
  )
}
