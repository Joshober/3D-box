import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Inject, Input, NgZone, OnChanges, OnDestroy, Output, PLATFORM_ID, SimpleChanges, ViewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BOX_FACES, FACE_VECTORS, MATERIAL_FACES, validDimensions, type BoxDimensions, type BoxFace, type BoxPhotos, type FaceImageError } from './types';
import { renderPhoto } from './perspective';
import { PhotoInputError } from './photo-source';
import { estimateBoxProportions } from './proportions';
import type { BoxProportionEstimate } from './types';

@Component({
  selector:'box-photo-viewer', standalone:true,
  template:`
    <div class="viewport" #host [attr.aria-busy]="loading" aria-label="Interactive 3D box. Drag to rotate, scroll or pinch to zoom.">
      <div class="topline"><span class="pill">3D INSPECTION</span><button type="button" (click)="reset()">↺ Reset view</button></div>
      @if(error) { <p class="error" role="alert">{{error}}</p> }
      @if(loading) { <p class="loading" role="status">Preparing photos…</p> }
      <div class="hint">Drag to rotate <span>·</span> Scroll / pinch to zoom</div>
    </div>
    <nav aria-label="Box faces">
      @for(face of faceNames; track face) { <button type="button" [class.active]="selected===face" [attr.aria-pressed]="selected===face" (click)="selectFace(face)">{{face}}</button> }
    </nav>
    @if(messages.length) { <div class="messages" role="status">@for(message of messages; track message.face) { <p>{{message.face}}: {{message.message}}</p> }</div> }
    <div class="inspection"><span>{{selected}} face</span><button type="button" (click)="openPhoto()" [disabled]="loading || !previews[selected]">Inspect photo ↗</button></div>
    <dialog #photoDialog aria-label="Enlarged face photo"><div class="dialog-head"><strong>{{selected}} · aligned photo</strong><button type="button" (click)="photoDialog.close()">Close ✕</button></div>@if(previews[selected]){<img [src]="previews[selected]" [alt]="selected+' aligned box face'">}<p>Scroll to inspect at full size.</p></dialog>
  `,
  styles:[`
    :host{display:block;color:#25382f;font:inherit}button{font:inherit;cursor:pointer;border:1px solid #d4ded6;background:#fff;color:inherit;padding:9px 14px;border-radius:7px}button:focus-visible{outline:3px solid #749b51}button:disabled{opacity:.4;cursor:default}.viewport{height:510px;position:relative;background:radial-gradient(ellipse at 50% 42%,#f8faf5,#e7ede5);border-radius:12px;overflow:hidden}.viewport canvas{display:block;touch-action:none}.topline{position:absolute;top:20px;left:20px;right:20px;display:flex;justify-content:space-between;align-items:center;z-index:1}.pill{font-size:10px;letter-spacing:1.7px;background:#fff9;border:1px solid #d5ded3;padding:8px 10px;border-radius:5px}.topline button{font-size:12px;background:#ffffffb0}.hint{position:absolute;bottom:20px;left:0;right:0;text-align:center;font-size:12px;pointer-events:none;color:#647365}.hint span{padding:0 10px}nav{display:flex;gap:7px;flex-wrap:wrap;padding:16px 0}nav button{text-transform:capitalize;flex:1;min-width:65px;font-size:12px}.active{background:#263e31;color:#fff;border-color:#263e31}.inspection{display:flex;align-items:center;justify-content:space-between;padding-top:4px}.inspection span{text-transform:capitalize;font-size:13px;color:#617166}.inspection button{font-size:12px}.loading{position:absolute;top:65px;left:20px;font-size:12px;color:#465d39}.error{position:absolute;top:90px;left:20px;right:20px;color:#903c28}.messages{color:#903c28;font-size:12px}dialog{position:fixed;inset:4vh 4vw;width:90vw;height:86vh;box-sizing:border-box;z-index:30;border:1px solid #cbd5c9;border-radius:12px;overflow:auto;background:#f8faf6;box-shadow:0 0 0 100vmax #14241dcc}dialog img{display:block;max-width:none;width:auto;max-height:none;min-width:250px;margin:20px auto}.dialog-head{display:flex;justify-content:space-between;position:sticky;top:0;background:#f8faf6;padding:10px;align-items:center}dialog p{text-align:center;font-size:12px}@media(max-width:650px){.viewport{height:370px}.hint{font-size:10px}}
  `]
})
export class BoxPhotoViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() photos: BoxPhotos={};
  @Input() allowedOrigins: readonly string[]=[];
  @Input() dimensions: BoxDimensions={width:1,height:1,depth:1};
  @Input() autoProportions=false;
  @Output() selectedFaceChange=new EventEmitter<BoxFace>();
  @Output() imageError=new EventEmitter<FaceImageError>();
  @Output() loadingChange=new EventEmitter<boolean>();
  @Output() proportionEstimate=new EventEmitter<BoxProportionEstimate|undefined>();
  @ViewChild('host',{static:true}) host!:ElementRef<HTMLDivElement>;
  @ViewChild('photoDialog',{static:true}) photoDialog!:ElementRef<HTMLDialogElement>;
  readonly faceNames=BOX_FACES;
  selected:BoxFace='front'; loading=false; error=''; messages:FaceImageError[]=[];
  previews:Partial<Record<BoxFace,string>>={};
  private renderer?:THREE.WebGLRenderer; private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(38,1,.01,100);
  private controls?:OrbitControls; private mesh?:THREE.Mesh<THREE.BoxGeometry,THREE.MeshBasicMaterial[]>;
  private edges?:THREE.LineSegments; private observer?:ResizeObserver;
  private generation=0; private destroyed=false;
  private abort?:AbortController;private frame?:number;
  private estimate?:BoxProportionEstimate;
  private ratios:Partial<Record<BoxFace,number>>={};
  private get activeDimensions(){return this.autoProportions&&this.estimate?this.estimate.dimensions:this.dimensions;}
  constructor(@Inject(PLATFORM_ID) private platform:object,private zone:NgZone,private cdr:ChangeDetectorRef){}
  ngAfterViewInit(){
    if(!isPlatformBrowser(this.platform)) return;
    try{
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio,2)); this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.domElement.setAttribute('aria-label','3D photo box');
      this.host.nativeElement.appendChild(this.renderer.domElement);
      this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
      this.renderer.domElement.addEventListener('webglcontextrestored',this.contextRestored);
      this.observer=new ResizeObserver(()=>{const {clientWidth:w,clientHeight:h}=this.host.nativeElement;if(w&&h){this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer?.setSize(w,h);this.fitCamera();}});
      this.observer.observe(this.host.nativeElement);
      this.reset(); void this.update();
    }catch{this.releaseRenderer();this.error='3D rendering is unavailable. Enable WebGL or use another browser. Photos can still be viewed in the editor.';this.cdr.markForCheck();}
  }
  ngOnChanges(changes:SimpleChanges){
    if(!this.renderer)return;
    if(changes['photos']||changes['allowedOrigins']||!this.mesh)void this.update();
    else if(changes['dimensions']||changes['autoProportions']){
      if(changes['autoProportions']&&this.autoProportions){this.estimate=estimateBoxProportions(this.ratios,this.dimensions);this.proportionEstimate.emit(this.estimate);}
      this.error=validDimensions(this.activeDimensions)?'':'Enter positive finite dimensions with a maximum 1000:1 aspect ratio.';
      if(!this.error){const d=this.activeDimensions,m=Math.max(d.width,d.height,d.depth);this.mesh.geometry.dispose();this.mesh.geometry=new THREE.BoxGeometry(d.width/m*2,d.height/m*2,d.depth/m*2);if(this.edges){this.edges.geometry.dispose();this.edges.geometry=new THREE.EdgesGeometry(this.mesh.geometry);}this.fitCamera();this.requestRender();}
    }
  }
  openPhoto(){if(!this.loading&&this.previews[this.selected])this.photoDialog.nativeElement.showModal();}
  private requestRender=()=>{
    if(this.destroyed||!this.renderer||this.frame!==undefined)return;
    this.zone.runOutsideAngular(()=>{this.frame=requestAnimationFrame(()=>{this.frame=undefined;this.controls?.update();this.renderer?.render(this.scene,this.camera);});});
  };
  private contextLost=(event:Event)=>{event.preventDefault();this.error='The graphics context was lost. Waiting for the browser to restore it.';this.cdr.markForCheck();};
  private contextRestored=()=>{this.error='';this.requestRender();this.cdr.markForCheck();};
  private resetControls(){
    if(!this.renderer)return;
    this.controls?.removeEventListener('change',this.requestRender);this.controls?.dispose();
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.enablePan=false;
    this.controls.addEventListener('change',this.requestRender);
  }
  reset(){this.camera.up.set(0,1,0);this.camera.position.set(2.8,2.1,3.5);this.resetControls();this.fitCamera();}
  private fitCamera(){
    if(!validDimensions(this.activeDimensions))return;
    const d=this.activeDimensions,max=Math.max(d.width,d.height,d.depth);
    const n=this.camera.position.clone().normalize(),right=new THREE.Vector3().crossVectors(this.camera.up,n).normalize(),up=new THREE.Vector3().crossVectors(n,right).normalize();
    const tan=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));let distance=0;
    for(const x of [-d.width/max,d.width/max])for(const y of [-d.height/max,d.height/max])for(const z of [-d.depth/max,d.depth/max]){
      const p=new THREE.Vector3(x,y,z);distance=Math.max(distance,p.dot(n)+1.2*Math.max(Math.abs(p.dot(right))/(tan*this.camera.aspect),Math.abs(p.dot(up))/tan));
    }
    const radius=Math.hypot(d.width/max,d.height/max,d.depth/max);
    if(this.controls){this.controls.minDistance=radius+.05;this.controls.maxDistance=Math.max(12,distance*3);}
    this.camera.far=Math.max(100,distance*4);this.camera.updateProjectionMatrix();
    this.camera.position.copy(n.multiplyScalar(Math.max(radius+.05,distance)));this.controls?.update();this.requestRender();
  }
  selectFace(face:BoxFace){
    if(!BOX_FACES.includes(face))return;
    this.selected=face; this.photoDialog?.nativeElement.close();
    this.camera.up.set(0,face==='top'||face==='bottom'?0:1,face==='top'?-1:face==='bottom'?1:0);
    this.camera.position.fromArray(FACE_VECTORS[face]).multiplyScalar(4);
    this.resetControls();this.fitCamera();this.selectedFaceChange.emit(face);
  }
  private placeholder(face:BoxFace){
    const c=document.createElement('canvas');c.width=512;c.height=512;const x=c.getContext('2d')!;
    x.fillStyle='#d9c8aa';x.fillRect(0,0,512,512);x.strokeStyle='#bfad8e';x.strokeRect(16,16,480,480);
    x.fillStyle='#72654e';x.textAlign='center';x.font='28px sans-serif';x.fillText(face.toUpperCase(),256,250);x.font='18px sans-serif';x.fillText('Add face photo',256,285);return c;
  }
  private releaseMesh(){
    if(this.mesh){this.scene.remove(this.mesh);this.mesh.geometry.dispose();for(const m of this.mesh.material){m.map?.dispose();m.dispose();}this.mesh=undefined;}
    if(this.edges){this.scene.remove(this.edges);this.edges.geometry.dispose();(this.edges.material as THREE.Material).dispose();this.edges=undefined;}
  }
  private async update(){
    this.abort?.abort();const controller=new AbortController();this.abort=controller;
    const gen=++this.generation;const photos=this.photos??{};
    this.estimate=undefined;this.ratios={};
    this.photoDialog?.nativeElement.close();this.previews={};this.messages=[];
    this.releaseMesh();this.requestRender();
    this.error=validDimensions(this.dimensions)?'':'Enter positive finite dimensions with a maximum 1000:1 aspect ratio.';
    if(this.error){this.loading=false;this.loadingChange.emit(false);this.cdr.markForCheck();return;}
    this.loading=true;this.loadingChange.emit(true);this.cdr.markForCheck();
    const messages:FaceImageError[]=[];const previews:Partial<Record<BoxFace,string>>={};
    const canvases:HTMLCanvasElement[]=[];
    const ratios:Partial<Record<BoxFace,number>>={};
    // Decode one face at a time to bound peak decoded-image memory.
    for(const face of MATERIAL_FACES){
      if(controller.signal.aborted)return;
      if(!photos[face]){canvases.push(this.placeholder(face));continue;}
      try{const c=await renderPhoto(photos[face]!,1024,{signal:controller.signal,allowedOrigins:this.allowedOrigins});ratios[face]=c.width/c.height;previews[face]=c.toDataURL();canvases.push(c);}
      catch(e){if(controller.signal.aborted)return;messages.push({face,code:e instanceof PhotoInputError?e.code:'invalid-input',message:e instanceof PhotoInputError?e.message:'Photo processing failed. Check its alignment and image format.'});canvases.push(this.placeholder(face));}
    }
    if(gen!==this.generation||this.destroyed)return;
    this.loading=false;this.loadingChange.emit(false);
    this.ratios=ratios;this.estimate=estimateBoxProportions(ratios,this.dimensions);
    if(this.autoProportions)this.proportionEstimate.emit(this.estimate);
    const d=this.activeDimensions;
    if(!validDimensions(d)){this.error='Enter positive finite dimensions with a maximum 1000:1 aspect ratio.';this.cdr.markForCheck();return;}
    this.releaseMesh();this.messages=messages;this.previews=previews;
    const max=Math.max(d.width,d.height,d.depth);
    const geo=new THREE.BoxGeometry(d.width/max*2,d.height/max*2,d.depth/max*2);
    const materials=canvases.map(c=>{const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=this.renderer!.capabilities.getMaxAnisotropy();return new THREE.MeshBasicMaterial({map});});
    this.mesh=new THREE.Mesh(geo,materials);this.scene.add(this.mesh);this.fitCamera();
    this.edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:0x675c45,transparent:true,opacity:.4}));this.scene.add(this.edges);
    this.requestRender();for(const m of messages)this.imageError.emit(m);this.cdr.markForCheck();
  }
  private releaseRenderer(){if(this.frame!==undefined)cancelAnimationFrame(this.frame);this.frame=undefined;this.observer?.disconnect();this.controls?.removeEventListener('change',this.requestRender);this.controls?.dispose();this.renderer?.domElement.removeEventListener('webglcontextlost',this.contextLost);this.renderer?.domElement.removeEventListener('webglcontextrestored',this.contextRestored);this.renderer?.dispose();this.renderer?.forceContextLoss();this.renderer?.domElement.remove();this.renderer=undefined;}
  ngOnDestroy(){this.destroyed=true;++this.generation;this.abort?.abort();this.releaseMesh();this.releaseRenderer();this.previews={};}
}
