import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Delete, MessageSquare, Navigation, Phone, PhoneOff, Send, Star, UserRound, X } from 'lucide-react'
import { useUi } from '../../../store/uiStore'
import { appendDialDigit } from './phoneState'

const CONTACTS = [
  { id:'demo', name:'Tesla · Demo', number:'DEMO 001', address:'3500 Deer Creek Road\nPalo Alto, CA', note:'Địa chỉ mẫu từ thiết kế · không dẫn đường thật' },
  { id:'support', name:'Tesla Roadside · Demo', number:'DEMO 002', address:'CabinSentinel', note:'Danh bạ mẫu · chưa kết nối điện thoại' },
]
type PhoneTab='Calls'|'Messages'|'Contacts'|'Favorites'
const TABS: {name:PhoneTab;icon:ReactNode}[]=[{name:'Calls',icon:<Phone/>},{name:'Messages',icon:<MessageSquare/>},{name:'Contacts',icon:<UserRound/>},{name:'Favorites',icon:<Star/>}]
export function TeslaPhone(){
 const [tab,setTab]=useState<PhoneTab>('Contacts'),[selected,setSelected]=useState('demo'),[digits,setDigits]=useState(''),[favorites,setFavorites]=useState<string[]>(['demo'])
 const [call,setCall]=useState<{name:string;number:string}|null>(null),[recent,setRecent]=useState<string[]>([])
 const [messages,setMessages]=useState<Record<string,string[]>>({demo:['Xin chào! Đây là hội thoại mô phỏng.'],support:['CabinSentinel · dữ liệu mẫu.']}),[draft,setDraft]=useState(''),[note,setNote]=useState('')
 const contact=CONTACTS.find(c=>c.id===selected)??CONTACTS[0]!
 const placeCall=(name:string,number:string)=>{setCall({name,number});setRecent(r=>[name,...r].slice(0,8))}
 const close=()=>useUi.getState().setOverlay(null)
 const rows=tab==='Favorites'?CONTACTS.filter(c=>favorites.includes(c.id)):CONTACTS
 const toggleFavorite=()=>setFavorites(x=>x.includes(contact.id)?x.filter(i=>i!==contact.id):[...x,contact.id])
 const send=()=>{if(!draft.trim())return;setMessages(m=>({...m,[selected]:[...(m[selected]??[]),draft.trim()]}));setDraft('')}
 return <motion.section className="tesla-phone" role="region" aria-label="Tesla Phone" initial={{opacity:0,y:32}} animate={{opacity:1,y:0}} exit={{opacity:0,y:24}}>
  <header><button type="button" aria-label="Đóng điện thoại" onClick={close}><X/></button><h2>{tab}</h2><span/></header>
  <AnimatePresence mode="wait" initial={false}><motion.div key={tab} className="tesla-phone-columns" initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-8}} transition={{duration:.15}}>
   <div className="tesla-phone-list">
    {tab==='Calls'?<><h3>Recent calls</h3>{recent.length?recent.map((name,i)=><button type="button" key={i} onClick={()=>placeCall(name,'DEMO')}><Phone size={22}/><span>{name}<small>Cuộc gọi mô phỏng</small></span></button>):<p>No recent calls<span>Danh sách mẫu, không đọc lịch sử thiết bị.</span></p>}</>:<>
     {rows.length?rows.map(c=><button key={c.id} type="button" onClick={()=>setSelected(c.id)} aria-pressed={selected===c.id}><span>{c.name}{tab==='Messages'&&<small>{messages[c.id]?.at(-1)}</small>}</span>{tab==='Favorites'&&<Star size={24} fill="currentColor"/>}</button>):<p>No favorites</p>}
     {tab==='Contacts'&&<div className="tesla-phone-alphabet" aria-hidden="true">{'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('').map(c=><span key={c}>{c}</span>)}</div>}
    </>}
   </div>
   <div className="tesla-phone-detail">
    {tab==='Calls'?<div className="tesla-dialer"><div className="tesla-dialer-number"><output aria-label="Số quay mô phỏng">{digits||'Enter number'}</output><button type="button" aria-label="Xoá chữ số" onClick={()=>setDigits(s=>s.slice(0,-1))}><Delete/></button></div><div className="tesla-dialer-grid">{['1','2','3','4','5','6','7','8','9','*','0','#'].map((d,i)=><motion.button type="button" key={d} aria-label={'Quay số '+d} onClick={()=>setDigits(s=>appendDialDigit(s,d))} whileTap={{scale:.92}}>{d}<small>{['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','+',''][i]}</small></motion.button>)}</div><button type="button" className="tesla-dialer-call" disabled={!digits} aria-label="Gọi số đã nhập · MÔ PHỎNG" onClick={()=>placeCall('Dialer',digits)}><Phone/></button></div>:tab==='Messages'?<>
      <h3>{contact.name}</h3><div className="tesla-phone-messages">{(messages[selected]??[]).map((message,i)=><p key={i}>{message}<small>SIMULATED</small></p>)}</div>
      <form className="tesla-phone-compose" onSubmit={e=>{e.preventDefault();send()}}><input aria-label="Tin nhắn mô phỏng" placeholder="Demo message" value={draft} maxLength={300} onChange={e=>setDraft(e.target.value)}/><button type="submit" aria-label="Thêm tin nhắn mô phỏng" disabled={!draft.trim()}><Send/></button></form>
    </>:<><div className="tesla-phone-contact-title"><h3>{contact.name}</h3><button type="button" aria-label="Yêu thích liên hệ" aria-pressed={favorites.includes(contact.id)} onClick={toggleFavorite}><Star fill={favorites.includes(contact.id)?'currentColor':'none'}/></button></div>
     <div className="tesla-phone-contact-row"><div><span>Work</span><p>{contact.number}</p></div><button type="button" aria-label="Gọi liên hệ · MÔ PHỎNG" onClick={()=>placeCall(contact.name,contact.number)}><Phone/></button></div>
     <div className="tesla-phone-contact-row"><div><span>Work</span><p style={{whiteSpace:'pre-line'}}>{contact.address}</p><small>{contact.note}</small></div><button type="button" aria-label="Địa chỉ mẫu" onClick={()=>setNote('Địa chỉ tham chiếu của mẫu thiết kế. Không mở lộ trình thật.')}><Navigation/></button></div>
    </>}
   </div>
  </motion.div></AnimatePresence>
  <nav aria-label="Phone tabs">{TABS.map(t=><button type="button" key={t.name} aria-current={tab===t.name?'page':undefined} onClick={()=>{setTab(t.name);setNote('')}}>{t.icon}<span>{t.name}</span></button>)}</nav>
  <p className="tesla-phone-simulation" role="status">{note||'SIMULATED · Danh bạ mẫu · không gọi điện, gửi tin nhắn hay kết nối Bluetooth thật'}</p>
  <AnimatePresence>{call&&<motion.div className="tesla-phone-call-overlay" role="dialog" aria-modal="true" aria-label="Cuộc gọi mô phỏng" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><UserRound size={72}/><h3>{call.name}</h3><p>{call.number}</p><span>SIMULATED · Không có cuộc gọi thực tế</span><button type="button" autoFocus aria-label="Kết thúc cuộc gọi mô phỏng" onClick={()=>setCall(null)}><PhoneOff/></button></motion.div>}</AnimatePresence>
 </motion.section>
}
