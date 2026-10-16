import test from 'node:test';
import assert from 'node:assert/strict';
import { cellToWorld,cameraBasis,screenRay,pickSlice,overlayGeometry,FOV_TANGENT } from '../locator.js';

const close=(actual,expected,epsilon=1e-10)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
const vectorClose=(actual,expected,epsilon)=>actual.forEach((v,i)=>close(v,expected[i],epsilon));
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const rect={left:100,top:50,width:800,height:400};

test('cell centres preserve source x/y/z indices and half-cell convention',()=>{
  vectorClose(cellToWorld([0,31,63]),[-.4921875,-.0078125,.4921875]);
  vectorClose(cellToWorld([1,3,2],4),[-.125,.375,.125]);
  assert.throws(()=>cellToWorld([0,0,64]),RangeError);
  assert.throws(()=>cellToWorld([0,0,.5]),RangeError);
  assert.throws(()=>cellToWorld([0,0,0],0),RangeError);
});

test('camera basis agrees with front and reverse views and stays orthonormal',()=>{
  const front=cameraBasis(0,0,2.65);
  vectorClose(front.eye,[0,0,2.65]);vectorClose(front.forward,[0,0,-1]);
  vectorClose(front.right,[1,0,0]);vectorClose(front.up,[0,1,0]);
  const reverse=cameraBasis(Math.PI,0,2.65);
  vectorClose(reverse.eye,[0,0,-2.65]);vectorClose(reverse.forward,[0,0,1]);
  vectorClose(reverse.right,[-1,0,0]);vectorClose(reverse.up,[0,1,0]);
  for(const camera of [cameraBasis(.68,.42,2.65),cameraBasis(.3,Math.PI/2,2)]) {
    for(const key of ['forward','right','up'])close(Math.hypot(...camera[key]),1);
    close(dot(camera.forward,camera.right),0);close(dot(camera.forward,camera.up),0);close(dot(camera.up,camera.right),0);
  }
});

test('screen rays account for canvas offset, aspect, positive Y and reverse view',()=>{
  const camera=cameraBasis(0,0,2);
  vectorClose(screenRay(500,250,rect,camera).direction,[0,0,-1]);
  const corner=screenRay(900,50,rect,camera).direction;
  close(corner[0]/-corner[2],FOV_TANGENT*2);close(corner[1]/-corner[2],FOV_TANGENT);
  const reverse=screenRay(900,50,rect,cameraBasis(Math.PI,0,2)).direction;
  assert.ok(reverse[0]<0&&reverse[1]>0&&reverse[2]>0);
  assert.throws(()=>screenRay(0,0,{...rect,height:0},camera),RangeError);
});

test('slice picking preserves selected actual plane and maps boundary cells by floor and clamp',()=>{
  const point=[7,19,31];
  const hit=pickSlice({origin:[.5,-.5,2],direction:[0,0,-4]},point,[2]);
  assert.deepEqual(hit.point,[63,0,31]);assert.equal(hit.axis,2);
  vectorClose(hit.position,[.5,-.5,-.0078125]);close(hit.distance,2.0078125);
  const interior=pickSlice({origin:[0,0,2],direction:[0,0,-1]},point,['z']);
  assert.deepEqual(interior.point,[32,32,31]);
  const reverse=pickSlice({origin:[0,0,-2],direction:[0,0,1]},point,[2]);
  assert.deepEqual(reverse.point,interior.point);close(reverse.distance,1.9921875);
});

test('all selected planes choose the nearest positive intersection instead of a volume surface',()=>{
  const ray={origin:[2,2,2],direction:[-1,-1,-1]};
  const point=[8,20,50];
  const hit=pickSlice(ray,point,[0,1,2]);
  assert.equal(hit.axis,2);assert.deepEqual(hit.point,[50,50,50]);
  vectorClose(hit.position,cellToWorld([50,50,50]));
  const xOnly=pickSlice(ray,point,[0]);
  assert.equal(xOnly.axis,0);assert.deepEqual(xOnly.point,[8,8,8]);
  assert.ok(xOnly.distance>hit.distance);
});

test('crop clips intersections and hidden Z planes without shifting a slice to the cut face',()=>{
  const ray={origin:[0,0,2],direction:[0,0,-1]};
  assert.equal(pickSlice(ray,[32,32,40],[2],.5),null);
  assert.deepEqual(pickSlice(ray,[32,32,20],[2],.5).point,[32,32,20]);
  assert.equal(pickSlice({origin:[2,0,.1],direction:[-1,0,0]},[32,32,20],[0],.5),null);
  assert.ok(pickSlice({origin:[2,0,0],direction:[-1,0,0]},[32,32,20],[0],.5));
  assert.equal(pickSlice(ray,[32,32,20],[0,1,2],0),null);
});

test('misses, backwards rays and near-parallel rays return no hit',()=>{
  const point=[31,31,31];
  assert.equal(pickSlice({origin:[2,2,2],direction:[0,0,-1]},point,[2]),null);
  assert.equal(pickSlice({origin:[0,0,2],direction:[0,0,1]},point,[2]),null);
  assert.equal(pickSlice({origin:[0,0,2],direction:[1,0,1e-12]},point,[2]),null);
  assert.equal(pickSlice({origin:[0,0,2],direction:[0,0,0]},point,[2]),null);
  assert.equal(pickSlice({origin:[0,0,2],direction:[0,0,-1]},point,[]),null);
  const p=cellToWorld(point);
  assert.equal(pickSlice({origin:p,direction:[0,0,1]},point,[2]),null);
});

test('overlay geometry uses actual cell centres and clips outlines and markers to displayed crop',()=>{
  const geometry=overlayGeometry([7,19,31],[0,1,2],.5);
  assert.equal(geometry.planes.length,3);assert.equal(geometry.marker.length,18);assert.equal(geometry.visible,true);
  vectorClose(geometry.position,cellToWorld([7,19,31]));
  for(const plane of geometry.planes) {
    assert.equal(plane.vertices.length,24);
    for(let i=0;i<plane.vertices.length;i+=3) {
      close(plane.vertices[i+plane.axis],geometry.position[plane.axis]);
      assert.ok(plane.vertices[i+2]<=0);
    }
  }
  for(let i=2;i<geometry.marker.length;i+=3)assert.ok(geometry.marker[i]<=0);
  const hidden=overlayGeometry([7,19,40],[0,1,2],.5);
  assert.deepEqual(hidden.planes.map(p=>p.axis),[0,1]);assert.equal(hidden.visible,false);assert.equal(hidden.marker.length,0);
  const empty=overlayGeometry([7,19,31],[0,1,2],0);
  assert.equal(empty.planes.length,0);assert.equal(empty.visible,false);
});
