import {inflateSync} from 'node:zlib';
const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([size,name,data,crc]);}
// Solo imágenes raster PNG, dimensiones pequeñas y datos descomprimidos acotados.
// Se eliminan EXIF, comentarios y otros metadatos antes de guardar la imagen.
export function sanitizeAvatar(dataURL){
  if(typeof dataURL!=='string' || !/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(dataURL)) throw new Error('Selecciona una imagen válida.');
  const encoded=dataURL.slice('data:image/png;base64,'.length),data=Buffer.from(encoded,'base64');
  if(data.toString('base64')!==encoded || data.length>300000 || !data.subarray(0,8).equals(signature)) throw new Error('La imagen no es un PNG válido o es demasiado grande.');
  let offset=8,header=null,ended=false,started=false,metadataAfterData=false;const pieces=[];
  while(offset<data.length){
    if(offset+12>data.length) throw new Error('Imagen incompleta.');
    const length=data.readUInt32BE(offset),type=data.toString('ascii',offset+4,offset+8),end=offset+12+length;
    if(end>data.length || !/^[A-Za-z]{4}$/.test(type)) throw new Error('Imagen incompleta.');
    const value=data.subarray(offset+8,offset+8+length);
    if(data.readUInt32BE(end-4)!==crc32(data.subarray(offset+4,end-4))) throw new Error('Imagen dañada.');
    if(!header && type!=='IHDR') throw new Error('Encabezado de imagen inválido.');
    if(type==='IHDR'){
      if(header || length!==13) throw new Error('Encabezado de imagen inválido.');
      const width=value.readUInt32BE(0),height=value.readUInt32BE(4);
      if(!width || !height || width>256 || height>256 || value[8]!==8 || ![2,6].includes(value[9]) || value[10]!==0 || value[11]!==0 || value[12]!==0) throw new Error('Usa una imagen de hasta 256 × 256 píxeles.');
      header=Buffer.from(value);
    }else if(type==='IDAT'){
      if(metadataAfterData) throw new Error('Datos de imagen inválidos.');
      started=true;pieces.push(value);
    }else if(type==='IEND'){
      if(length || !started || end!==data.length) throw new Error('Imagen incompleta.');ended=true;
    }else{
      if(type[0]===type[0].toUpperCase()) throw new Error('Formato de imagen no admitido.');
      if(started)metadataAfterData=true;
    }
    offset=end;
  }
  if(!ended || !header || !pieces.length) throw new Error('Imagen incompleta.');
  const width=header.readUInt32BE(0),height=header.readUInt32BE(4),channels=header[9]===6?4:3,rowSize=width*channels+1;
  const compressed=Buffer.concat(pieces),raw=inflateSync(compressed,{maxOutputLength:rowSize*height});
  if(raw.length!==rowSize*height) throw new Error('Datos de imagen inválidos.');
  for(let row=0;row<height;row++)if(raw[row*rowSize]>4)throw new Error('Datos de imagen inválidos.');
  return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',Buffer.alloc(0))]);
}
