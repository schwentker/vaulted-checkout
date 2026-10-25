// Add the shared semantic frames as editable presentation objects.
export function addFrames(presentation, frames, existingSlides){
 const ids=[];
 for(const [index,frame] of frames.entries()){
  const slide=existingSlides?.[index]??presentation.slides.add();
  if(existingSlides?.[index])slide.shapes.deleteAll();
  slide.background.fill='#FFFFFF';
  const scale=slide.frame.width/(frame.width??1920);
  if(Math.abs(slide.frame.height/slide.frame.width-9/16)>0.001)throw Error('Storyboard requires a 16:9 slide');
  for(const n of frame.nodes){
   const line={style:'solid',fill:n.stroke??'none',width:(n.sw??0)*scale};
   const name=`${frame.scene}-${frame.step}-${n.id}`;
   if(n.type==='rect')slide.shapes.add({geometry:'rect',name,position:{left:n.x*scale,top:n.y*scale,width:n.w*scale,height:n.h*scale},fill:n.fill,line});
   if(n.type==='circle')slide.shapes.add({geometry:'ellipse',name,position:{left:(n.x-n.r)*scale,top:(n.y-n.r)*scale,width:n.r*2*scale,height:n.r*2*scale},fill:n.fill,line});
   if(n.type==='text'){
    const shape=slide.shapes.add({geometry:'textbox',name,position:{left:n.x*scale,top:(n.y-n.size*0.91)*scale,width:n.w*scale,height:n.size*1.45*scale},fill:'none',line:{fill:'none',width:0}});
    shape.text=n.value;
    shape.text.style={fontSize:n.size*scale,bold:n.kind==='bold',typeface:n.kind==='mono'?'Menlo':'Futura',color:n.opacity===.4?'#A0A3A8':n.color,wrap:'none',autoFit:'none',insets:0,verticalAlignment:'top'};
   }
   if(n.type==='poly'){
    const xs=n.points.map(p=>p[0]),ys=n.points.map(p=>p[1]);
    const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(1,Math.max(...xs)-x),h=Math.max(1,Math.max(...ys)-y);
    const commands=n.points.map((p,i)=>({[i===0?'moveTo':'lineTo']:{x:(p[0]-x)*scale,y:(p[1]-y)*scale}}));
    if(n.closed)commands.push({close:{}});
    slide.shapes.add({geometry:'custom',name,position:{left:x*scale,top:y*scale,width:w*scale,height:h*scale},fill:n.fill,line,customPaths:[{width:w*scale,height:h*scale,commands}]});
   }
  }
  slide.speakerNotes.text=frame.notes;
  ids.push(slide.id);
 }
 return ids;
}
