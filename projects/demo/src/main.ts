import { ChangeDetectorRef, Component, OnDestroy, ViewChild } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { BOX_FACES, BoxPhotoEditorComponent, BoxPhotoViewerComponent, validatePhotoFile, type BoxDimensions, type BoxFace, type BoxPhotos, type FacePhoto } from 'box-photo-viewer';
import type { BoxProportionEstimate } from 'box-photo-viewer';

@Component({selector:'app-root',standalone:true,imports:[BoxPhotoViewerComponent,BoxPhotoEditorComponent],
template:`
  <header><a class="brand" href="/">▧ <span>parcel<span class="brand-dot">.</span></span></a><span class="header-tag">PHOTO → 3D</span><a class="github" href="#integration">Angular ready ↗</a></header>
  <main>
    <div class="intro"><div><div class="eyebrow"><span></span> A NEW PERSPECTIVE ON PACKAGE INSPECTION</div><h1>Every side.<br><em>Nothing overlooked.</em></h1><p>Bring your box photos together. Rotate, zoom, and take a closer look<br class="desktop"> at every crease, tear, and corner.</p></div><div class="intro-note"><span class="tiny-box">▧</span><span>Six photos.<br>One complete view.</span></div></div>
    <div class="workspace">
      <section class="viewer-panel"><div class="section-head"><div><span class="step">01</span><h2>Your box, in perspective</h2></div><span class="local"><i></i> Local processing</span></div>
        @if(mounted){<box-photo-viewer [photos]="photos" [dimensions]="dimensions" [autoProportions]="autoProportions" (proportionEstimate)="estimated($event)" (selectedFaceChange)="selected=$event"/>}
        <div class="shape-controls"><label><input type="checkbox" [checked]="autoProportions" (change)="setAuto($event)"> Estimate shape from photos</label><p>Use close, straight-on photos or align the face corners. Estimates describe proportions, not measured size. Unseen dimensions keep their previous proportions.</p>
        @if(shapeEstimate && autoProportions){<p class="shape-result" role="status">{{shapeDescription}} · {{shapeEstimate.faces.length}} face(s) used · height = 1</p>@if(shapeEstimate.inconsistent){<p class="error">These face ratios disagree. Check cropping, orientation, and whether the photos show the same box.</p>}}
        @if(usingSamples){<p>The sample preset mixes two boxes. Use your own photos for a meaningful shape estimate.</p>}
        </div>
        <div class="dimensions"><span>BOX PROPORTIONS <small>relative units</small></span>@for(axis of axes;track axis){<label>{{axis}}<input type="number" min="0.001" step="0.1" [value]="dimensions[axis]" (change)="dimension(axis,$event)"></label>}</div>
        @if(dimensionError){<p class="error" role="alert">{{dimensionError}}</p>}
      </section>
      <aside><div class="section-head"><div><span class="step">02</span><h2>Face photographs</h2></div><span class="count">{{photoCount}} / 6</span></div><p class="aside-description">Choose a face to upload or align its photograph.</p>
        <div class="faces">@for(face of faceNames;track face){<div class="face-card" [class.selected]="selected===face"><button class="face-select" type="button" (click)="select(face)">@if(photos[face]){<img [src]="thumbnail(face)" [alt]="face+' source thumbnail'">}@else{<span class="empty-face">＋</span>}<span>{{face}}</span><small>{{photos[face] ? 'Photo added' : 'No photo'}}</small></button><label class="upload" [attr.aria-label]="'Upload '+face+' photo'">{{photos[face] ? 'Replace' : 'Upload'}}<input type="file" accept="image/jpeg,image/png,image/webp" (change)="upload(face,$event)"></label>@if(photos[face]){<button type="button" class="remove" [attr.aria-label]="'Remove '+face+' photo'" (click)="remove(face)">×</button>}</div>}</div>
        @if(uploadError){<p class="error" role="alert">{{uploadError}}</p>}
        <div class="editor"><box-photo-editor [face]="selected" [photo]="photos[selected]" (photoChange)="changePhoto($event)"/></div>
      </aside>
    </div>
    <section class="sample-strip"><span class="sample-icon">↗</span><div><strong>Start with a real-world example</strong><p>Real damaged-box photos from the web. Illustrative faces use two different boxes, not a complete parcel capture.</p></div><button type="button" (click)="loadSamples()">Load sample photos <span>→</span></button><button type="button" class="text-button" (click)="clear()">Clear all</button></section>
    <details class="credits"><summary>Sample photo credits & capture tips</summary><p>Take six photos of the same box, one per face, with each face filling the frame. Use the four-corner editor to remove perspective. Enter measured dimensions for accurate proportions. Photos show surface damage; the mesh remains rectangular.</p><p>“Damaged Cardboard Box Labelled Fragile” by <a href="https://meanwell-packaging.co.uk/">Meanwell Packaging</a> · <a href="https://commons.wikimedia.org/wiki/File:Damaged_Cardboard_Box_Labelled_Fragile.jpg">Original</a>. “Damaged FedEx Box – Corner Smashed In Cardboard Shipping Container” by Tony Webster · <a href="https://commons.wikimedia.org/wiki/File:Damaged_FedEx_Box_-_Corner_Smashed_In_Cardboard_Shipping_Container_(53371562280).jpg">Original</a>. Both <a href="https://creativecommons.org/licenses/by/2.0/">CC BY 2.0</a>. Demo faces are cropped and perspective corrected from these photographs.</p></details>
    <section id="integration" class="integration"><div><div class="eyebrow">BUILT TO FIT YOUR WORKFLOW</div><h2>Your Angular app.<br>The same complete view.</h2><p>A standalone component with typed inputs.<br>Install the package and bring your own photos.</p></div><div class="code"><span>TERMINAL</span><pre>npm install ./box-photo-viewer-1.2.0.tgz three@^0.186.1</pre><span>YOUR TEMPLATE</span><pre>&lt;box-photo-viewer
  [photos]="boxPhotos"
  [dimensions]="boxDimensions"
/&gt;</pre></div></section>
    <footer><span>parcel. / Six sides to every story.</span><span>Angular + Three.js · Photos stay on your device</span></footer>
  </main>
`})
export class AppComponent implements OnDestroy {
  faceNames=BOX_FACES;axes=['width','height','depth'] as const;
  photos:BoxPhotos={};dimensions:BoxDimensions={width:40,height:30,depth:30};selected:BoxFace='front';
  autoProportions=true;usingSamples=false;shapeEstimate?:BoxProportionEstimate;
  constructor(private cdr:ChangeDetectorRef){this.loadSamples();}
  uploadError='';dimensionError='';mounted=true;private urls=new Map<BoxFace,string>();private uploadVersions=new Map<BoxFace,number>();
  @ViewChild(BoxPhotoViewerComponent) viewer?:BoxPhotoViewerComponent;
  get photoCount(){return Object.keys(this.photos).length;}
  select(face:BoxFace){this.selected=face;this.viewer?.selectFace(face);}
  dimension(axis:keyof BoxDimensions,event:Event){const value=Number((event.target as HTMLInputElement).value);const next={...this.dimensions,[axis]:value};if(!Number.isFinite(value)||value<=0||Math.max(next.width,next.height,next.depth)/Math.min(next.width,next.height,next.depth)>1000){this.dimensionError='Enter positive dimensions with a maximum 1000:1 aspect ratio.';return;}this.dimensionError='';this.autoProportions=false;this.dimensions=next;}
  setAuto(event:Event){this.autoProportions=(event.target as HTMLInputElement).checked;this.dimensionError='';}
  estimated(estimate:BoxProportionEstimate|undefined){this.shapeEstimate=estimate;if(this.autoProportions&&estimate){this.dimensions={width:Number(estimate.dimensions.width.toPrecision(4)),height:1,depth:Number(estimate.dimensions.depth.toPrecision(4))};}}
  get shapeDescription(){const d=this.shapeEstimate?.dimensions;if(!d)return '';const max=Math.max(d.width,d.height,d.depth),min=Math.min(d.width,d.height,d.depth);if(max/min<1.1)return 'Approximately cube-shaped';return d.width>1.1?'Wide rectangular box':d.width<.9?'Tall rectangular box':'Square front with estimated depth';}
  async upload(face:BoxFace,event:Event){
    const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;input.value='';this.uploadError='';
    const version=(this.uploadVersions.get(face)??0)+1;this.uploadVersions.set(face,version);
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25*1024*1024){this.uploadError='Choose a JPEG, PNG, or WebP image under 25 MB.';return;}
    try{await validatePhotoFile(file);if(this.uploadVersions.get(face)!==version)return;if(this.usingSamples)this.resetDisplay();this.release(face);this.urls.set(face,URL.createObjectURL(file));this.photos={...this.photos,[face]:{src:file,name:file.name}};this.select(face);}
    catch(e){if(this.uploadVersions.get(face)===version)this.uploadError=e instanceof Error?e.message:'Cannot load photo.';}
    finally{this.cdr.markForCheck();}
  }
  thumbnail(face:BoxFace):string|undefined {const src=this.photos[face]?.src;return typeof src==='string'?src:this.urls.get(face);}
  changePhoto(photo:FacePhoto){this.photos={...this.photos,[this.selected]:photo};}
  remove(face:BoxFace){this.release(face);const next={...this.photos};delete next[face];this.photos=next;}
  private resetDisplay(){for(const url of this.urls.values())URL.revokeObjectURL(url);this.urls.clear();this.photos={};this.uploadError='';this.dimensionError='';this.usingSamples=false;this.autoProportions=true;this.shapeEstimate=undefined;this.dimensions={width:1,height:1,depth:1};}
  clear(){for(const face of this.faceNames)this.release(face);this.resetDisplay();}
  private release(face:BoxFace){this.uploadVersions.set(face,(this.uploadVersions.get(face)??0)+1);const url=this.urls.get(face);if(url)URL.revokeObjectURL(url);this.urls.delete(face);}
  loadSamples(){this.clear();this.usingSamples=true;this.autoProportions=false;this.dimensions={width:40,height:30,depth:30};this.photos={
    front:{src:'samples/fragile.jpg',name:'Meanwell Packaging · illustrative front',corners:[{x:.318,y:.241},{x:.662,y:.245},{x:.66,y:.61},{x:.316,y:.611}]},
    right:{src:'samples/fedex.jpg',name:'Tony Webster · different box, cropped side',corners:[{x:.75,y:.02},{x:.968,y:.02},{x:.858,y:.706},{x:.695,y:.9}]},
    top:{src:'samples/fragile.jpg',name:'Meanwell Packaging · repeated front, not an actual top photo',corners:[{x:.318,y:.241},{x:.662,y:.245},{x:.66,y:.61},{x:.316,y:.611}]},
    back:{src:'samples/fedex.jpg',name:'Tony Webster · illustrative cropped face',corners:[{x:.39,y:.21},{x:.696,y:.21},{x:.671,y:.83},{x:.410,y:.73}]},
    left:{src:'samples/fedex.jpg',name:'Tony Webster · illustrative repeated image',corners:[{x:.39,y:.21},{x:.696,y:.21},{x:.671,y:.83},{x:.410,y:.73}]},
    bottom:{src:'samples/fragile.jpg',name:'Meanwell Packaging · repeated front, not an actual bottom photo',corners:[{x:.318,y:.241},{x:.662,y:.245},{x:.66,y:.61},{x:.316,y:.611}]}
  };}
  ngOnDestroy(){this.clear();}
}
bootstrapApplication(AppComponent).catch(console.error);
