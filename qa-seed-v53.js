import { saveState } from './db.js';

const seeded=sessionStorage.getItem('autojournal-qa-v53-seeded');
if(!seeded){
  const state={
    version:5,
    settings:{theme:'light',defaultWarnKm:1500,defaultWarnDays:30,currency:'RUB',lastBackupAt:''},
    activeCarId:'car-a',nextSeq:20,
    cars:[
      {id:'car-a',make:'Hyundai',model:'Sonata',year:'2008',engine:'2.0',plate:'A111AA13',vin:'',initialOdometer:200000,currentOdometer:215000,purchaseDate:'2024-06-15',purchasePrice:500000,trackingStartDate:'2026-07-01'},
      {id:'car-b',make:'Ford',model:'Focus',year:'2012',engine:'1.6',plate:'B222BB13',vin:'',initialOdometer:50000,currentOdometer:53000,purchaseDate:'2025-01-10',purchasePrice:650000,trackingStartDate:'2026-08-01'},
      {id:'car-c',make:'Lada',model:'Vesta',year:'2020',engine:'1.6',plate:'C333CC13',vin:'',initialOdometer:10000,currentOdometer:10500,purchaseDate:'2026-01-01',purchasePrice:900000,trackingStartDate:'2026-09-01'}
    ],
    odometerLogs:[
      {id:'oa1',carId:'car-a',date:'2026-07-01',value:200000,note:'Начало',sourceType:'manual',sourceId:'oa1'},
      {id:'oa2',carId:'car-a',date:'2026-08-01',value:205000,note:'',sourceType:'manual',sourceId:'oa2'},
      {id:'oa3',carId:'car-a',date:'2026-09-01',value:210000,note:'',sourceType:'manual',sourceId:'oa3'},
      {id:'oa4',carId:'car-a',date:'2026-09-20',value:212000,note:'',sourceType:'manual',sourceId:'oa4'},
      {id:'oa5',carId:'car-a',date:'2026-10-01',value:215000,note:'',sourceType:'manual',sourceId:'oa5'},
      {id:'ob1',carId:'car-b',date:'2026-08-01',value:50000,note:'',sourceType:'manual',sourceId:'ob1'},
      {id:'ob2',carId:'car-b',date:'2026-09-01',value:51500,note:'',sourceType:'manual',sourceId:'ob2'},
      {id:'ob3',carId:'car-b',date:'2026-10-01',value:53000,note:'',sourceType:'manual',sourceId:'ob3'},
      {id:'oc1',carId:'car-c',date:'2026-09-01',value:10000,note:'',sourceType:'manual',sourceId:'oc1'},
      {id:'oc2',carId:'car-c',date:'2026-10-01',value:10500,note:'',sourceType:'manual',sourceId:'oc2'}
    ],
    serviceEntries:[
      {id:'s-a1',carId:'car-a',date:'2026-09-10',odometer:211000,type:'replacement',title:'Передние тормозные колодки',category:'Тормоза',faultKey:'',workText:'Замена передних колодок',partsText:'Sangsin',partsCost:4200,laborCost:1500,otherCost:0,componentId:'comp-both',componentAction:'',notes:'',photos:[],createdAt:'2026-09-10T12:00:00.000Z',seq:1},
      {id:'s-a2',carId:'car-a',date:'2026-10-01',odometer:215000,type:'maintenance',title:'Замена моторного масла',category:'Двигатель',faultKey:'',workText:'',partsText:'',partsCost:4200,laborCost:800,otherCost:0,componentId:'',componentAction:'',notes:'',photos:[],createdAt:'2026-10-01T10:00:00.000Z',seq:2},
      {id:'s-b1',carId:'car-b',date:'2026-09-15',odometer:52200,type:'repair',title:'Ремонт подвески',category:'Подвеска',faultKey:'',workText:'',partsText:'',partsCost:8000,laborCost:4000,otherCost:0,componentId:'',componentAction:'',notes:'',photos:[],createdAt:'2026-09-15T10:00:00.000Z',seq:3}
    ],
    components:[
      {id:'comp-km',carId:'car-a',name:'Ремень навесного оборудования',category:'Двигатель',brand:'Mando',partNumber:'',baseInstalledDate:'2026-07-01',baseInstalledOdometer:200000,installedDate:'2026-07-01',installedOdometer:200000,lifeKm:20000,lifeMonths:0,inspectKm:0,inspectMonths:0,warnKm:5000,warnDays:0,cost:2500,notes:'Только км',sourceEntryId:'',lastInspectionDate:'2026-07-01',lastInspectionOdometer:200000},
      {id:'comp-month',carId:'car-a',name:'Тормозная жидкость',category:'Тормоза',brand:'',partNumber:'',baseInstalledDate:'2026-04-01',baseInstalledOdometer:195000,installedDate:'2026-04-01',installedOdometer:195000,lifeKm:0,lifeMonths:6,inspectKm:0,inspectMonths:0,warnKm:0,warnDays:30,cost:1000,notes:'Только месяцы',sourceEntryId:'',lastInspectionDate:'2026-04-01',lastInspectionOdometer:195000},
      {id:'comp-both',carId:'car-a',name:'Передние тормозные колодки',category:'Тормоза',brand:'Sangsin',partNumber:'',baseInstalledDate:'2026-09-10',baseInstalledOdometer:211000,installedDate:'2026-09-10',installedOdometer:211000,lifeKm:40000,lifeMonths:24,inspectKm:10000,inspectMonths:6,warnKm:1500,warnDays:14,cost:4200,notes:'Создано из записи',sourceEntryId:'s-a1',lastInspectionDate:'2026-09-10',lastInspectionOdometer:211000},
      {id:'comp-inspect',carId:'car-a',name:'Направляющие суппорта',category:'Тормоза',brand:'',partNumber:'',baseInstalledDate:'2026-07-01',baseInstalledOdometer:200000,installedDate:'2026-07-01',installedOdometer:200000,lifeKm:0,lifeMonths:0,inspectKm:5000,inspectMonths:0,warnKm:1000,warnDays:0,cost:0,notes:'Только проверка',sourceEntryId:'',lastInspectionDate:'2026-07-01',lastInspectionOdometer:200000},
      {id:'comp-b',carId:'car-b',name:'Масло',category:'Двигатель',brand:'',partNumber:'',baseInstalledDate:'2026-09-01',baseInstalledOdometer:51500,installedDate:'2026-09-01',installedOdometer:51500,lifeKm:10000,lifeMonths:12,inspectKm:0,inspectMonths:0,warnKm:1000,warnDays:30,cost:3500,notes:'',sourceEntryId:'',lastInspectionDate:'2026-09-01',lastInspectionOdometer:51500}
    ],
    expenses:[
      {id:'e-a1',carId:'car-a',date:'2026-09-10',odometer:211000,category:'Обслуживание',amount:5700,description:'Передние тормозные колодки',note:'Создано из сервисной записи',linkedServiceId:'s-a1',linkedRefuelId:''},
      {id:'e-a2',carId:'car-a',date:'2026-10-01',odometer:215000,category:'Обслуживание',amount:5000,description:'Замена моторного масла',note:'Создано из сервисной записи',linkedServiceId:'s-a2',linkedRefuelId:''},
      {id:'e-a3',carId:'car-a',date:'2026-09-15',odometer:211500,category:'Топливо',amount:3000,description:'Лукойл',note:'Создано из заправки',linkedServiceId:'',linkedRefuelId:'r-a1'},
      {id:'e-a4',carId:'car-a',date:'2026-10-01',odometer:215000,category:'Топливо',amount:3300,description:'Роснефть',note:'Создано из заправки',linkedServiceId:'',linkedRefuelId:'r-a2'},
      {id:'e-a5',carId:'car-a',date:'2026-09-25',odometer:0,category:'Мойка',amount:700,description:'Мойка',note:'',linkedServiceId:'',linkedRefuelId:''},
      {id:'e-b1',carId:'car-b',date:'2026-09-15',odometer:52200,category:'Ремонт',amount:12000,description:'Ремонт подвески',note:'',linkedServiceId:'s-b1',linkedRefuelId:''}
    ],
    documents:[
      {id:'d-a1',carId:'car-a',title:'ОСАГО',type:'Страховка',number:'TEST-OSAGO',issueDate:'2026-01-01',expiryDate:'2026-10-10',remindDays:30,files:[]},
      {id:'d-a2',carId:'car-a',title:'Диагностическая карта',type:'Диагностика',number:'DK-1',issueDate:'2026-01-01',expiryDate:'2026-12-31',remindDays:30,files:[]},
      {id:'d-b1',carId:'car-b',title:'ОСАГО Focus',type:'Страховка',number:'F-1',issueDate:'2026-01-01',expiryDate:'2027-01-01',remindDays:30,files:[]}
    ],
    refuels:[
      {id:'r-a1',carId:'car-a',date:'2026-09-15',odometer:211500,fuelType:'АИ-95',amount:3000,liters:50,pricePerLiter:60,fullTank:true,station:'Лукойл',address:'',notes:'',createdAt:'2026-09-15T12:00:00.000Z'},
      {id:'r-a2',carId:'car-a',date:'2026-10-01',odometer:215000,fuelType:'АИ-95',amount:3300,liters:50,pricePerLiter:66,fullTank:true,station:'Роснефть',address:'',notes:'',createdAt:'2026-10-01T12:00:00.000Z'},
      {id:'r-b1',carId:'car-b',date:'2026-09-20',odometer:52500,fuelType:'АИ-95',amount:2400,liters:40,pricePerLiter:60,fullTank:true,station:'Газпромнефть',address:'',notes:'',createdAt:'2026-09-20T12:00:00.000Z'}
    ]
  };
  await saveState(state);
  sessionStorage.setItem('autojournal-qa-v53-seeded','1');
}
await import('./app-v53.js');
