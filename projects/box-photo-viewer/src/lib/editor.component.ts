import { ChangeDetectorRef, Component, EventEmitter, Inject, Input, OnChanges, OnDestroy, Output, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DEFAULT_CORNERS, type BoxFace, type FaceCorners, type FacePhoto, type Point } from './types';
import { renderPhoto, validateCorners } from './perspective';
import { loadPhoto, PhotoInputError } from './photo-source';

@Component({selector:'box-photo-editor',standalone:true,
  template:`
    <div class="head"><strong>{{face}} photo</strong><span>ALIGNMENT</span></div>
    @if(photo){
      @if(photo.name){<p>{{photo.name}}</p>}
      <p>Tap the face corners in order: <b>{{cornerLabels[points.length] || 'Ready to apply'}}</b>.</p>
      @if(original){<div class="image-wrap"><img [src]="original" [alt]="face+' original photo'">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" (click)="addPoint($event)" role="img" aria-label="Tap four corners clockwise">
          @if(points.length>1){<polyline [attr.points]="polygon" fill="none" stroke="#c5f589" stroke-width="0.6"/>}
          @for(p of points;track $index){<circle [attr.cx]="p.x*100" [attr.cy]="p.y*100" r="1.5" fill="#c5f589"/>}
        </svg>
      </div>}
      <div class="coords">@for(p of points;track $index){<label>{{cornerLabels[$index]}}<input type="number" min="0" max="1" step="0.01" [value]="p.x" (change)="coordinate($index,'x',$event)" aria-label="Corner x"><input type="number" min="0" max="1" step="0.01" [value]="p.y" (change)="coordinate($index,'y',$event)" aria-label="Corner y"></label>}</div>
      <div class="actions"><button type="button" (click)="startCorners()">Select corners</button><button type="button" (click)="reset()">Full photo</button><button type="button" (click)="rotate()">Rotate 90°</button><button type="button" class="primary" [disabled]="points.length!==4" (click)="apply()">Apply alignment</button></div>
      @if(error){<p role="alert" class="error">{{error}}</p>}
      @if(preview){<details><summary>Aligned preview</summary><img class="preview" [src]="preview" alt="Aligned photo preview"></details>}
    }@else{<p>Add a photo to align this face.</p>}
  `,
  styles:[`:host{display:block;font:inherit;color:#314637}.head{display:flex;justify-content:space-between;align-items:center}.head strong{text-transform:capitalize}.head span{font-size:9px;letter-spacing:1.5px;color:#6e7f70}p{font-size:12px;line-height:1.7;color:#6b796e}.image-wrap{position:relative;line-height:0;background:#e4e8dd;border-radius:8px;overflow:hidden}.image-wrap img{width:100%;display:block}.image-wrap svg{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;touch-action:manipulation}.actions{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}button{font:inherit;font-size:11px;padding:8px 10px;background:white;border:1px solid #d4ded6;border-radius:5px;cursor:pointer}button:disabled{opacity:.4}.primary{background:#2e4936;color:white}input{width:49px;min-width:0;font:inherit;font-size:11px;border:1px solid #d4ded6;border-radius:3px;padding:3px}.coords{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.coords label{font-size:9px;display:flex;gap:3px;align-items:center}.preview{max-width:100%;max-height:350px}summary{cursor:pointer;font-size:12px}.error{color:#9d3924}`]
})
export class BoxPhotoEditorComponent implements OnChanges,OnDestroy {
  @Input() face:BoxFace='front';@Input() photo?:FacePhoto;
  @Input() allowedOrigins:readonly string[]=[];
  @Output() photoChange=new EventEmitter<FacePhoto>();
  points:Point[]=[];preview='';original='';error='';private generation=0;private abort?:AbortController;
  readonly cornerLabels=['top-left','top-right','bottom-right','bottom-left'];
  constructor(private cdr:ChangeDetectorRef,@Inject(PLATFORM_ID) private platform:object){}
  get polygon(){return [...this.points,...(this.points.length===4?[this.points[0]]:[])].map(p=>`${p.x*100},${p.y*100}`).join(' ');}
  ngOnChanges(){this.abort?.abort();this.error='';this.original='';this.preview='';try{const corners=this.photo?.corners??DEFAULT_CORNERS;validateCorners(corners);this.points=corners.map(p=>({...p}));}catch{this.points=[];this.error='Invalid photo corners. Select four clockwise corners inside the photo.';}if(isPlatformBrowser(this.platform))void this.updatePreview();}
  startCorners(){this.points=[];this.error='';}
  addPoint(e:MouseEvent){if(this.points.length===4)this.points=[];const rect=(e.currentTarget as SVGElement).getBoundingClientRect();this.points=[...this.points,{x:(e.clientX-rect.left)/rect.width,y:(e.clientY-rect.top)/rect.height}];}
  coordinate(i:number,key:'x'|'y',event:Event){this.points=this.points.map((p,j)=>j===i?{...p,[key]:Number((event.target as HTMLInputElement).value)}:p);}
  apply(){if(!this.photo)return;try{const corners=this.points as FaceCorners;validateCorners(corners);this.error='';this.photoChange.emit({...this.photo,corners:corners.map(p=>({...p})) as FaceCorners});}catch(e){this.error=(e as Error).message;}}
  reset(){if(this.photo)this.photoChange.emit({...this.photo,corners:undefined,rotation:0});}
  rotate(){if(!this.photo)return;try{validateCorners(this.points as FaceCorners);this.error='';this.photoChange.emit({...this.photo,corners:this.points.map(p=>({...p})) as FaceCorners,rotation:(((this.photo.rotation??0)+90)%360) as FacePhoto['rotation']});}catch{this.error='Select all four face corners before rotating.';}}
  private async updatePreview(){
    const g=++this.generation;const photo=this.photo;if(!photo)return;
    const controller=new AbortController();this.abort=controller;const options={signal:controller.signal,allowedOrigins:this.allowedOrigins};
    try{
      const loaded=await loadPhoto(photo.src,options);
      try{if(controller.signal.aborted)return;const image=loaded.image,c=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight));c.width=Math.max(1,Math.round(image.naturalWidth*scale));c.height=Math.max(1,Math.round(image.naturalHeight*scale));c.getContext('2d')!.drawImage(image,0,0,c.width,c.height);this.original=c.toDataURL();this.cdr.markForCheck();}finally{loaded.dispose();}
      const c=await renderPhoto(photo,650,options);if(g===this.generation&&!controller.signal.aborted){this.preview=c.toDataURL();this.cdr.markForCheck();}
    }catch(e){if(g===this.generation&&!controller.signal.aborted){this.error=e instanceof PhotoInputError?e.message:'Photo processing failed.';this.cdr.markForCheck();}}
  }
  ngOnDestroy(){++this.generation;this.abort?.abort();this.preview='';this.original='';}
}
