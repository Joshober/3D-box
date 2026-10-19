import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { BoxPhotoViewerComponent, BoxPhotoEditorComponent, type BoxPhotos, type BoxDimensions, type BoxFace, type FacePhoto } from 'box-photo-viewer';
@Component({selector:'app-root',standalone:true,imports:[BoxPhotoViewerComponent,BoxPhotoEditorComponent],template:`
  <button type="button" (click)="mounted=!mounted">Toggle viewer</button>
  <label>Host photo <input type="file" (change)="file($event)"></label>
  <label>Photo URL <input type="text" (input)="url=$any($event.target).value"></label>
  <button type="button" (click)="photos={front:{src:url}}">Load URL</button>
  <button type="button" (click)="origins=['https://photos.example']">Allow test origin</button>
  @if(mounted){<box-photo-viewer [photos]="photos" [dimensions]="dimensions" [autoProportions]="true" [allowedOrigins]="origins" (selectedFaceChange)="selected=$event" />}
  <box-photo-editor [face]="selected" [photo]="photos[selected]" [allowedOrigins]="origins" (photoChange)="update($event)" />
`})
class App {
  mounted=true;
  url='';origins:string[]=[];
  photos:BoxPhotos={};dimensions:BoxDimensions={width:2,height:1,depth:1};selected:BoxFace='front';
  update(photo:FacePhoto){this.photos={...this.photos,[this.selected]:photo};}
  file(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(file)this.photos={front:{src:file,name:file.name}};}
}
bootstrapApplication(App).catch(console.error);
