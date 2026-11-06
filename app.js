const D=[{"p":4,"w":347,"g":330,"hc":9,"gc":[36.20534,139.03059],"club":"1W","risk":"左に林とバンカー、グリーン左手前に大バンカー","aim":"フェアウェイ中央。右へのミスを見込む","green":"左手前と奥にバンカー。右手前から入れる"},{"p":3,"w":168,"g":144,"hc":3,"gc":[36.20444,139.02818],"club":"5W（右狙い）","risk":"ティーから見て左〜正面左が大きな池","aim":"グリーン右サイドを狙う。左へ外すと池","green":"右手前と奥にバンカー。左は池の縁"},{"p":4,"w":318,"g":318,"hc":15,"gc":[36.20677,139.02748],"club":"4U","risk":"ティー正面右が池（越えるまで約130Y・マップ目測）。その先の左右にバンカー","aim":"ティー左側の生垣方向へ。池の左を抜ける","green":"左手前・右手前にバンカー。中央手前が開いている"},{"p":5,"w":483,"g":449,"hc":7,"gc":[36.20829,139.0232],"club":"5W","risk":"右は深い林。2打目地点の右に2連バンカー。OB率44%","aim":"中央〜左。カート道側へ","green":"左と右手前にバンカー。受けのある砲台型に見える"},{"p":4,"w":348,"g":324,"hc":13,"gc":[36.20534,139.02645],"club":"5W","risk":"右に柵と右バンカー。バンカー率67%","aim":"左サイド。左は斜面で受けやすい","green":"左手前・右手前にバンカー。中央手前が開いている"},{"p":4,"w":380,"g":349,"hc":1,"gc":[36.20478,139.02264],"club":"1W","risk":"左に曲がる。曲がり角付近の左右にバンカー","aim":"中央。右バンカーの手前まででよい","green":"バンカーは右側のみ。左から攻める"},{"p":5,"w":537,"g":493,"hc":5,"gc":[36.20352,139.02875],"club":"1W","risk":"中盤左にバンカー。グリーン左に池","aim":"1打目は中央。3打目以降は右寄りへ","green":"左手前・右手前・奥にバンカー、左奥に池。右寄りが安全"},{"p":3,"w":151,"g":133,"hc":17,"gc":[36.20398,139.02984],"club":"7I","risk":"左手前・右手前にバンカー、奥にも1つ。バンカー率89%","aim":"バンカーの間の手前中央。届かなくてよい","green":"手前中央の入口を使う。奥へこぼさない"},{"p":4,"w":381,"g":359,"hc":11,"gc":[36.20783,139.03309],"club":"5W","risk":"ティー近くの右に溝と林。中盤左にバンカー","aim":"中央。右の林へ行かない","green":"左手前・右手前・奥にバンカー。グリーン奥の池は通常届かない"},{"p":4,"w":373,"g":339,"hc":10,"gc":[36.21178,139.0331],"club":"1W","risk":"右へ緩く曲がる。右にフェアウェイバンカー","aim":"左サイド。カート道側へ","green":"左手前・右手前の大バンカーと奥バンカー。中央から入れる"},{"p":4,"w":360,"g":328,"hc":4,"gc":[36.20966,139.03639],"club":"5W/5U","risk":"左へ曲がる。左は林。グリーン周りにバンカー4か所。OB率38%","aim":"右サイド。ショートカットしない","green":"手前左右と左・奥にバンカー。右手前からが無難"},{"p":3,"w":147,"g":129,"hc":16,"gc":[36.21171,139.03793],"club":"5U／7I（9I以下は不可）","risk":"ティーの先は谷越え。茂みと池。OB率60%","aim":"中央やや右。谷を越すことが最優先","green":"左手前と右手前にバンカー。手前の花道に残れば十分"},{"p":5,"w":509,"g":463,"hc":2,"gc":[36.21554,139.03681],"club":"5U","risk":"左へ大きく曲がる。左の木の奥に池、右にバンカー。OB率57%","aim":"中央〜やや右。右バンカーの手前まで","green":"左手前・右手前にバンカー。中央から入れる"},{"p":4,"w":333,"g":313,"hc":14,"gc":[36.21446,139.04007],"club":"5U","risk":"右に張り出す木、中盤左にバンカー。FWキープ率14%","aim":"中央。飛ばさなくてよい","green":"左手前・右手前にバンカー。中央から入れる"},{"p":4,"w":408,"g":355,"hc":8,"gc":[36.21186,139.03886],"club":"5W","risk":"ティーは高台。右にバンカー、左に林。距離が長い","aim":"中央〜やや左","green":"左手前の大バンカー、左奥、右にバンカー。中央手前から"},{"p":3,"w":185,"g":148,"hc":18,"gc":[36.21291,139.04074],"club":"4U","risk":"右の茂みと小さな池。右手前にバンカー","aim":"左サイド。カート道側へ","green":"右手前と左奥にバンカー。左手前が安全"},{"p":4,"w":351,"g":294,"hc":12,"gc":[36.21069,139.03911],"club":"4U／苦手ならSWで刻む","risk":"中盤を池が横切る（越えるまで約130Y・マップ目測）。OB率55%","aim":"4Uで池越え。不安ならSWで池の手前へ（AWは池に届く恐れ）","green":"左奥・左手前・右手前にバンカー。中央手前から"},{"p":5,"w":493,"g":449,"hc":6,"gc":[36.20767,139.03399],"club":"5W","risk":"中盤左に大バンカー。グリーン手前右に大きな木。OB率44%","aim":"中央","green":"左手前・右手前・奥にバンカー。手前中央から"}];
const KEY='twinlakes-v1';
const CV=2;
const DEF=[['1W',180],['3W',150],['5W',150],['4U',160],['5U',140],['6I',130],['7I',130],['8I',120],['9I',105],['PW',100],['AW',85],['SW',60]];
const U={view:'hole',sel:null,arm:false};
let R={cv:CV,cur:1,tee:'w',holes:{},clubs:DEF.map(c=>({name:c[0],dist:c[1]})),gps:false};
let G={watch:null,y:null,acc:null,at:0,err:''};
const app=document.getElementById('app');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function say(t,ms){const e=document.querySelector('#status span');e.textContent=t;clearTimeout(say.t);if(ms)say.t=setTimeout(()=>e.textContent='',ms)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(R))}catch(e){say('この端末に保存できません。',4000)}}
function load(){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x&&x.holes){R=Object.assign(R,x);if(x.cv!==CV){R.cv=CV;R.clubs=DEF.map(c=>({name:c[0],dist:c[1]}));save()}}}catch(e){}}
function H(n){return R.holes[n]||(R.holes[n]={shots:[],rem:null,putts:0,green:false})}
function yards(n){return D[n-1][R.tee==='g'?'g':'w']}
function rem(n){const h=H(n);return h.rem==null?yards(n):h.rem}
function strokes(h){return h.shots.reduce((a,s)=>a+1+(s.pen||0),0)+h.putts}
function touched(h){return h.shots.length>0||h.putts>0}
function byDist(){const o=c=>R.clubs.indexOf(c);return R.clubs.filter(c=>c.dist>0).slice().sort((a,b)=>a.dist-b.dist||o(b)-o(a))}
function yardsTo(a,b){const r=Math.PI/180,E=6371000,dl=(b[0]-a[0])*r,dg=(b[1]-a[1])*r,x=Math.sin(dl/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dg/2)**2;return Math.round(2*E*Math.asin(Math.sqrt(x))/0.9144)}
const LIE={fw:'FW',light:'浅いラフ',deep:'深いラフ'};
function lieOf(h){return h.lie||'fw'}
function ng(c,h){const k=lieOf(h);if(k==='light')return /1W|3W|5W|6I/.test(c.name);if(k==='deep')return !/AW|SW/.test(c.name);return false}
function eff(c,h){const k=lieOf(h),f=k==='light'?.9:k==='deep'?.5:1;return f===1?c.dist:Math.round(c.dist*f/5)*5}
function lieBox(h){return '<section class="card"><div class="h">球の場所</div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px">'+Object.keys(LIE).map(k=>'<button class="'+(lieOf(h)===k?'act':'ghost')+'" data-lie="'+k+'" aria-pressed="'+(lieOf(h)===k)+'">'+LIE[k]+'</button>').join('')+'</div><p class="note">打ったあとはFWに戻ります。ラフに入ったら押してください。</p></section>'}
function suggest(n){
  const h=H(n),r=rem(n),d=D[n-1];
  if(h.green)return{c:'パター',n:'カップをオーバーしない強さで。',rec:null};
  if(!h.shots.length&&h.rem==null)return{c:d.club,n:d.aim,rec:d.club};
  const l=byDist();if(!l.length)return{c:'番手を登録',n:'「番手の距離」で登録してください。',rec:null};
  const k=lieOf(h);
  if(k==='deep')return{c:'SWかAWで出す',n:'距離は考えません。フェアウェイへ戻せれば成功です。',rec:'SW'};
  if(r<=30)return{c:'SWかAWで寄せる',n:'グリーン中央へ。ピンは狙いません。',rec:'SW'};
  if(k==='light'){
    const a=l.filter(c=>!ng(c,h)),fit=a.find(c=>eff(c,h)>=r);
    if(fit)return{c:fit.name,n:'ラフのため目安'+eff(fit,h)+'Y。短く持って、コンパクトに振ります。',rec:fit.name};
    const u=a.find(c=>c.name==='7I')||a[a.length-1];
    return{c:'7Iか8Iで花道へ',n:'ラフから無理に届かせません。7Iは目安'+eff(u,h)+'Yで残り約'+Math.max(0,r-eff(u,h))+'Y。',rec:'7I'};
  }
  const fit=l.find(c=>c.dist>=r&&!/1W|3W/.test(c.name));
  if(fit)return{c:fit.name,n:'目安'+fit.dist+'Y。池とバンカーを避ける番手を優先します。',rec:fit.name};
  const u=l.find(c=>c.name==='5U')||l[Math.max(0,l.length-3)];return{c:u.name+'で刻む',n:'目安'+u.dist+'Yで残り約'+Math.max(0,r-u.dist)+'Y。曲げないことを優先します。',rec:u.name};
}
function gpsLine(){
  if(!R.gps)return'GPSはオフです。';if(G.err)return G.err;if(G.y==null)return'現在地を取得しています。';
  const age=Math.round((Date.now()-G.at)/1000);return'グリーン中央まで '+G.y+'Y（誤差 約'+Math.round(G.acc/0.9144)+'Y・'+age+'秒前）';
}
function holeView(){
  const n=R.cur,d=D[n-1],h=H(n),s=suggest(n),r=rem(n);
  const opts=D.map((x,i)=>{const v=R.holes[i+1],m=v&&touched(v)?' ('+strokes(v)+')':'';return'<option value="'+(i+1)+'"'+(i+1===n?' selected':'')+'>'+(i+1)+'番 Par'+x.p+m+'</option>'}).join('');
  const clubs=byDist().slice().reverse().map(c=>{const on=U.sel===c.name,rc=s.rec&&(c.name===s.rec||s.rec.indexOf(c.name)>=0);return'<button data-club="'+esc(c.name)+'" class="'+(on?'sel ':'')+(rc?'rec':'')+'"'+(ng(c,h)?' style="opacity:.55"':'')+'>'+esc(c.name)+'<small>'+(ng(c,h)?'使わない':eff(c,h)+'Y')+'</small></button>'}).join('');
  const sel=U.sel?'<div class="res"><button data-res="ok">普通</button><button class="mid" data-res="short">短い</button><button class="warn" data-res="ob">OB・池</button></div><p class="note">'+esc(U.sel)+'の結果を選びます。短いは目安の半分です。OB・池は1打罰で距離は変えません。</p>'+(ADV[U.sel]?'<p class="note" style="color:var(--fg)">'+esc(ADV[U.sel][1])+'</p>':''):'';
  const log=h.shots.length?'<div class="log">'+h.shots.map((x,i)=>'<span>'+(i+1)+'. '+esc(x.c)+' '+({ok:'普通',short:'短い',ob:'OB・池'}[x.r])+'</span>').join('')+'</div>':'';
  app.innerHTML='<div class="nav"><button data-go="-1" aria-label="前のホール">◀</button><select id="pick" aria-label="ホール選択">'+opts+'</select><button data-go="1" aria-label="次のホール">▶</button></div>'+
  '<div class="now"><div><div class="lab">'+(h.green?'グリーン上':'残り')+'　'+(R.tee==='g'?'Green':'White')+' '+yards(n)+'Y・HDCP'+d.hc+'</div><div class="rem">'+(h.green?'ON':r+'Y')+'</div></div><div class="sc">打数<b>'+strokes(h)+'</b>Par'+d.p+'</div></div>'+
  '<div class="gps"><div class="t" id="gpsline">'+esc(gpsLine())+'</div><button data-act="gps" class="'+(R.gps?'':'off')+'">GPS '+(R.gps?'オン':'オフ')+'</button></div>'+
  (!h.green&&(h.shots.length||h.rem!=null)?lieBox(h):'')+
  '<div class="sug"><div class="t">次の番手</div><div class="c">'+esc(s.c)+'</div><div class="n">'+esc(s.n)+'</div></div>'+
  (h.green?'<section class="card"><div class="h">パット '+h.putts+'</div><div class="two"><button class="ghost" data-putt="-1">1減らす</button><button class="act" data-putt="1">パットを記録</button></div><button class="ghost" data-act="ungreen">グリーンを外れた（戻す）</button></section>':
  '<section class="card"><div class="h">打ったクラブ</div><div class="clubs">'+clubs+'</div>'+sel+log+'<div class="two"><button class="ghost" data-act="undo"'+(h.shots.length?'':' disabled')+'>1打戻す</button><button class="act" data-act="green">グリーンに乗った</button></div></section>'+
  '<section class="card"><div class="h">残り距離を手入力</div><div class="row"><input class="input" id="fix" type="number" inputmode="numeric" min="0" max="700" placeholder="カートナビのY" aria-label="残りヤード"><button class="act" data-act="fix">反映</button></div></section>')+
  '<section class="card"><dl><dt>危険</dt><dd>'+esc(d.risk)+'</dd><dt>狙い</dt><dd>'+esc(d.aim)+'</dd><dt>グリーン周り</dt><dd>'+esc(d.green)+'</dd></dl></section>';
}
function scoreView(){
  const row=(a,b)=>{let t=0,html='';for(let i=a;i<=b;i++){const h=R.holes[i],d=D[i-1],v=h&&touched(h)?strokes(h):null;if(v!=null)t+=v;html+='<tr data-hole="'+i+'"><td>'+i+'</td><td>'+d.p+'</td><td>'+(v==null?'-':v)+'</td><td>'+(h&&h.putts?h.putts:'-')+'</td><td>'+(h?h.shots.filter(s=>s.r==='ob').length||'-':'-')+'</td></tr>'}return{html,t}};
  const o=row(1,9),i=row(10,18);
  app.innerHTML='<section class="card"><div class="h">合計 '+(o.t+i.t)+' 打</div><table><thead><tr><th>H</th><th>Par</th><th>打数</th><th>パット</th><th>OB・池</th></tr></thead><tbody>'+o.html+'<tr class="sum"><td colspan="2">OUT</td><td>'+o.t+'</td><td></td><td></td></tr>'+i.html+'<tr class="sum"><td colspan="2">IN</td><td>'+i.t+'</td><td></td><td></td></tr></tbody></table><p class="note">行をタップするとそのホールを開きます。</p></section>';
}
function clubsView(){
  app.innerHTML='<section class="card"><div class="h">使うティー</div><div class="two"><button class="'+(R.tee==='w'?'act':'ghost')+'" data-tee="w">White</button><button class="'+(R.tee==='g'?'act':'ghost')+'" data-tee="g">Green</button></div></section><section class="card"><div class="h">番手の距離（Y）</div>'+R.clubs.map((c,i)=>'<div class="row"><div style="align-self:center;font-weight:700">'+esc(c.name)+'</div><input class="input" data-dist="'+i+'" type="number" inputmode="numeric" min="1" max="350" value="'+c.dist+'" aria-label="'+esc(c.name)+'の距離"></div>').join('')+'</section><section class="card"><button class="link" data-act="reset">'+(U.arm?'もう一度押すと全ホールの記録を消します':'ラウンド記録をすべて消す')+'</button></section>';
}
const ADV={"1W":["ティーのみ","ティーのみ。右へのミスを前提に、フェアウェイ左を向く。練習で計測なし。レッスン2では右ばかりだったので、手を高く上げず、3秒止まれる強さで振る。"],"3W":["使わない","6球で57〜177Y。今回いちばん結果が散った番手。5Wと距離が同じなので、明日は使わなくてよい。"],"5W":["使わない","1球のみ159Y。ティーとFWの平らな場所だけで使う。"],"4U":["短く持って可","2球とも189Yで、今回いちばん良い番手候補。ただし2球だけなので160Yで計画。3番・17番の池越えと16番のティーで使う。"],"5U":["短く持って可","未計測で目安のまま。長い距離が残った時の刻みの基本番手。"],"6I":["使わない","4球で106〜157Y。50Y以上の差があり、距離が読めない。ラフでは8I以下に下げる。"],"7I":["可","1球のみ140Y。6Iを超えるとは判断できないので130Yで計画。12番の谷越えはこの番手以上。"],"8I":["可","肩までで80〜97Y、フルで120Y。95Yを肩までで打つ選択肢がある。"],"9I":["可","100Yと106Y。結果が近く、今回は安定。"],"PW":["可","5球で81〜115Y。中央値107Yだが、コースでは手前に残りがちなので100Yで計画。コーチの話どおり、90Yも強く振らず普通に振る。"],"AW":["可","8球で76〜99Y。いちばんデータが多い。70〜90Yの主力。17番の刻みには使わない（池に届く恐れ）。"],"SW":["深いラフ・30Y以内","肩まで58〜60Y、フル63Y。肩までで十分飛ぶので、フルで振らない。"]};
function bands(k){const h0={lie:k},a=byDist().filter(c=>!/1W|3W/.test(c.name)&&!ng(c,h0));let p=0;const o=[];a.forEach(c=>{const d=eff(c,h0);if(d>p){o.push([p?(p+1)+'〜'+d+'Y':d+'Y以内',c.name]);p=d}});o.push([(p+1)+'Y以上',k==='light'?'7Iか8Iで花道へ':'5Uで刻む']);return o}
function bandTable(t,k){return'<div><table><thead><tr><th>'+t+'</th><th>番手</th></tr></thead><tbody>'+bands(k).map(x=>'<tr><td>'+x[0]+'</td><td style="font-weight:700">'+esc(x[1])+'</td></tr>').join('')+'</tbody></table></div>'}
function adviceView(){
  const sec=U.adv||'club',n=R.cur,d=D[n-1],h=H(n);
  const tabs='<section class="card"><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px">'+[['club','番手別'],['chart','残り距離'],['lie','ラフ・傾斜']].map(x=>'<button class="'+(sec===x[0]?'act':'ghost')+'" style="white-space:nowrap;font-size:14px;padding:0 2px" data-adv="'+x[0]+'" aria-pressed="'+(sec===x[0])+'">'+x[1]+'</button>').join('')+'</div><p class="note">今は'+n+'番 Par'+d.p+'・球の場所は'+LIE[lieOf(h)]+'です。下の「ホール」で戻れます。</p></section>';
  let b='';
  if(sec==='club'){const fw={lie:'fw'},lt={lie:'light'};b=R.clubs.map(c=>{const a=ADV[c.name];return'<section class="card"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><div class="h" style="font-size:18px">'+esc(c.name)+'</div><div style="font-weight:700;color:var(--accent);white-space:nowrap">'+c.dist+'Y'+(ng(c,lt)?'':'・浅いラフ'+eff(c,lt)+'Y')+'</div></div><div style="font-size:15px;line-height:1.6">'+esc(a?a[1]:'登録した番手です。')+'</div><div class="note">ラフ：'+esc(a?a[0]:'未設定')+'</div></section>'}).join('')}
  else if(sec==='chart'){b='<section class="card"><div class="h">残り距離から番手を選ぶ</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;align-items:start">'+bandTable('FW','fw')+bandTable('浅いラフ','light')+'</div><p class="note">深いラフは距離に関係なくSWかAWで出します。30Y以内はSWかAWで寄せます。</p></section><section class="card"><div class="h">池・谷を越える時だけ</div><div style="font-size:15px;line-height:1.6">距離は転がり込みです。越える距離に<b>20Yを足して</b>番手を選びます（仮のルール）。<br>3番・17番（約130Y）→ 4U<br>12番（約110Y）→ 7I以上</div></section>'}
  else{b='<section class="card"><dl>'+[['FW（芝が短い）','表の距離どおり。ウッドが使えるのはここだけ。いつもの手順で、3秒止まれる強さで振ります。'],['浅いラフ（球が見える）','距離は1割引で計算。ウッドと6Iは使いません。短く持ち、足幅を少し狭く、ボールを少し右へ。コンパクトに振り抜きます。'],['深いラフ（球が沈む）','距離は考えず、SWかAWでFWへ出します。力まず、1打で戻せれば成功です。'],['上り傾斜（左足上がり）','手前に残りやすいので1番手大きく。傾斜に逆らわず立ち、振りすぎず当てます。'],['下り傾斜（左足下がり）','番手を下げ、SW〜8Iで前へ運びます。ボールは右寄り。すくい上げません。'],['バンカー','SWで1回で出すことを優先します。砂の中では素振りでも砂に触りません（2打罰の対象）。']].map(x=>'<dt>'+x[0]+'</dt><dd>'+x[1]+'</dd>').join('')+'</dl><p class="note">ラフの割引と傾斜の項目は一般的な目安です。コーチの指示を優先してください。</p></section>'}
  app.innerHTML=tabs+b;
}
function render(){({hole:holeView,score:scoreView,advice:adviceView,clubs:clubsView})[U.view]();document.querySelectorAll('.tabbar button').forEach(b=>b.setAttribute('aria-current',b.dataset.view===U.view))}
function refreshGps(){const e=document.getElementById('gpsline');if(e)e.textContent=gpsLine()}
function onPos(p){
  G.err='';G.acc=p.coords.accuracy;G.at=Date.now();const y=yardsTo([p.coords.latitude,p.coords.longitude],D[R.cur-1].gc);
  if(y>1000){G.y=null;G.err='コースから離れています。';refreshGps();return}
  G.y=y;const h=H(R.cur);
  if(U.view==='hole'&&!h.green&&G.acc<=40&&(h.shots.length||h.rem!=null||y<yards(R.cur)-20)){if(h.rem!==y){h.rem=y;save();if(!U.sel&&document.activeElement.id!=='fix'&&document.activeElement.id!=='pick')render();return}}
  refreshGps();
}
function onErr(e){G.err=e.code===1?'位置情報が許可されていません。Chromeの設定で許可してください。':'現在地を取得できません。';refreshGps()}
function gpsOn(){if(!navigator.geolocation){G.err='この端末ではGPSを使えません。';return}if(G.watch==null)G.watch=navigator.geolocation.watchPosition(onPos,onErr,{enableHighAccuracy:true,maximumAge:5000,timeout:20000})}
function gpsOff(){if(G.watch!=null){navigator.geolocation.clearWatch(G.watch);G.watch=null}G.y=null;G.err=''}
function moveTo(n){R.cur=n;U.sel=null;G.y=null;save();render();window.scrollTo(0,0)}
function shot(res){const n=R.cur,h=H(n),c=R.clubs.find(x=>x.name===U.sel);if(!c)return;const r=rem(n);let nr=r,pen=0;const e=eff(c,h),k=lieOf(h);if(res==='ok')nr=Math.max(0,r-e);else if(res==='short')nr=Math.max(0,r-Math.round(e/2));else pen=1;h.shots.push({c:c.name,r:res,pen,before:r,lie:k});h.rem=nr;h.lie='fw';U.sel=null;save();render();window.scrollTo(0,0)}
document.addEventListener('click',e=>{
  const b=e.target.closest('button,tr[data-hole]');if(!b)return;const a=b.dataset;
  if(a.view){U.view=a.view;U.arm=false;render();window.scrollTo(0,0);return}
  if(a.go){moveTo(Math.min(18,Math.max(1,R.cur+Number(a.go))));return}
  if(a.hole){U.view='hole';moveTo(Number(a.hole));return}
  if(a.club){U.sel=U.sel===a.club?null:a.club;render();return}
  if(a.res){shot(a.res);return}
  if(a.adv){U.adv=a.adv;render();window.scrollTo(0,0);return}
  if(a.lie){const h=H(R.cur);h.lie=a.lie;save();render();return}
  if(a.tee){R.tee=a.tee;save();render();return}
  if(a.putt){const h=H(R.cur);h.putts=Math.max(0,h.putts+Number(a.putt));save();render();return}
  const h=H(R.cur);
  if(a.act==='gps'){R.gps=!R.gps;R.gps?gpsOn():gpsOff();save();render()}
  else if(a.act==='undo'){const s=h.shots.pop();if(s){h.rem=s.before;h.lie=s.lie||'fw'}save();render()}
  else if(a.act==='green'){h.green=true;save();render();window.scrollTo(0,0)}
  else if(a.act==='ungreen'){h.green=false;save();render()}
  else if(a.act==='fix'){const f=document.getElementById('fix'),v=Number(f.value);if(f.value===''||!(v>=0&&v<=700)){say('0から700までの数字を入力してください。',3000);return}h.rem=Math.round(v);save();render();say('残り'+Math.round(v)+'Yに直しました。',2500)}
  else if(a.act==='reset'){if(!U.arm){U.arm=true;render();return}U.arm=false;R.holes={};R.cur=1;save();render();say('記録を消しました。',2500)}
});
document.addEventListener('change',e=>{
  if(e.target.id==='pick'){moveTo(Number(e.target.value));return}
  const i=e.target.dataset&&e.target.dataset.dist;if(i==null)return;const v=Number(e.target.value);if(!(v>0&&v<=350)){say('1から350までの数字を入力してください。',3000);return}R.clubs[i].dist=Math.round(v);save();say(R.clubs[i].name+'を'+R.clubs[i].dist+'Yにしました。',2500)
});
load();render();if(R.gps)gpsOn();
setInterval(()=>{if(R.gps&&U.view==='hole')refreshGps()},5000);
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
