package com.sheshield.app.ui.components

import com.sheshield.app.R

import android.content.Context
import android.graphics.PointF
import android.os.Bundle
import com.mapbox.geojson.*
import com.mapbox.mapboxsdk.Mapbox
import com.mapbox.mapboxsdk.camera.CameraUpdateFactory
import com.mapbox.mapboxsdk.camera.CameraPosition
import com.mapbox.mapboxsdk.geometry.LatLng
import com.mapbox.mapboxsdk.geometry.LatLngBounds
import com.mapbox.mapboxsdk.maps.*
import com.mapbox.mapboxsdk.style.layers.*
import com.mapbox.mapboxsdk.style.layers.PropertyFactory.*
import com.mapbox.mapboxsdk.style.sources.GeoJsonSource
import com.mapbox.mapboxsdk.style.expressions.Expression
import com.sheshield.app.data.model.*
import com.sheshield.app.util.TripMath

class RouteMapRenderer(context:Context,state:Bundle?=null){
    val view:MapView
    private var map:MapboxMap?=null
    private var style:Style?=null
    private var options:List<RouteOption> = emptyList()
    private var selected:String?=null
    private var current:LocationFix?=null
    private var follow=false
    private var navigating=false
    private var heading:Double?=null
    private var headingAnchor:LocationFix?=null
    private var movementHeading:Double?=null
    private var movementUntil=0L
    private var avoided:List<AvoidArea> = emptyList()
    private var detailLayer="REPORTS"
    var onArea:((ReportArea)->Unit)?=null
    var onPlace:((MappedPlace)->Unit)?=null
    private var requestedOrigin:Place?=null
    private var requestedDestination:Place?=null
    private val previewLabel=Ui.text(context,"Salt Lake preview · synthetic",11,true).apply{
        setPadding(Ui.dp(context,10),Ui.dp(context,6),Ui.dp(context,10),Ui.dp(context,6))
        background=Ui.background(context,R.color.surface,12);visibility=android.view.View.GONE
    }
    var onPick:((Place)->Unit)?=null
    var onSelect:((String)->Unit)?=null
    var onReady:(()->Unit)?=null
    init{
        Mapbox.getInstance(context);view=MapView(context);view.onCreate(state)
        view.addView(previewLabel,android.widget.FrameLayout.LayoutParams(-2,-2,android.view.Gravity.BOTTOM or android.view.Gravity.START).apply{setMargins(Ui.dp(context,12),0,0,Ui.dp(context,28))})
        view.getMapAsync{m->map=m
            m.setStyle(Style.Builder().fromJson("""{"version":8,"sources":{"osm":{"type":"raster","tiles":["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],"tileSize":256,"attribution":"© OpenStreetMap contributors"}},"layers":[{"id":"osm","type":"raster","source":"osm","paint":{"raster-saturation":-0.65,"raster-contrast":-0.05,"raster-brightness-max":${if(view.context.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK == android.content.res.Configuration.UI_MODE_NIGHT_YES)0.45 else 1.0}}}]}""")){s->
                style=s;m.uiSettings.isCompassEnabled=navigating
                listOf("alternatives","selected","unknown","reports","high","medium","endpoints","position","avoidance","report-areas","lit-stretches","unlit-stretches","nearby-places","help-places").forEach{s.addSource(GeoJsonSource(it,FeatureCollection.fromFeatures(emptyArray<Feature>())))}
                s.addLayer(FillLayer("report-area-fill","report-areas").withProperties(fillColor(Ui.color(view.context,R.color.risk_medium)),fillOpacity(.08f)))
                s.addLayer(LineLayer("report-area-outline","report-areas").withProperties(lineColor(Ui.color(view.context,R.color.risk_medium)),lineWidth(1.5f),lineDasharray(arrayOf(3f,3f))))
                s.addLayer(FillLayer("avoidance-fill","avoidance").withProperties(fillColor(Ui.color(view.context,R.color.risk_high)),fillOpacity(.25f)))
                s.addLayer(LineLayer("avoidance-outline","avoidance").withProperties(lineColor(Ui.color(view.context,R.color.risk_high)),lineWidth(2f)))
                s.addLayer(LineLayer("alternative-lines","alternatives").withProperties(lineColor(Expression.get("route_color")),lineWidth(4f),lineOpacity(.8f),lineCap(Property.LINE_CAP_ROUND),lineJoin(Property.LINE_JOIN_ROUND)))
                s.addLayer(LineLayer("route-outline","selected").withProperties(lineColor(Ui.color(view.context,R.color.surface)),lineWidth(9f),lineCap(Property.LINE_CAP_ROUND),lineJoin(Property.LINE_JOIN_ROUND)))
                s.addLayer(LineLayer("route-line","selected").withProperties(lineColor(Expression.get("route_color")),lineWidth(5f),lineCap(Property.LINE_CAP_ROUND),lineJoin(Property.LINE_JOIN_ROUND)))
                s.addLayer(LineLayer("unknown-line","unknown").withProperties(lineColor(Ui.color(view.context,R.color.risk_unknown)),lineWidth(3f),lineOpacity(.55f),lineDasharray(arrayOf(2f,2f))))
                s.addLayer(LineLayer("report-line","reports").withProperties(lineColor(Ui.color(view.context,R.color.risk_medium)),lineWidth(5f)))
                s.addLayer(LineLayer("medium-line","medium").withProperties(lineColor(Ui.color(view.context,R.color.risk_medium)),lineWidth(5f),lineCap(Property.LINE_CAP_ROUND)))
                s.addLayer(LineLayer("high-line","high").withProperties(lineColor(Ui.color(view.context,R.color.risk_high)),lineWidth(5f),lineCap(Property.LINE_CAP_ROUND)))
                s.addLayer(LineLayer("lit-detail","lit-stretches").withProperties(lineColor(Ui.color(view.context,R.color.purple_primary)),lineWidth(6f)))
                s.addLayer(LineLayer("unlit-detail","unlit-stretches").withProperties(lineColor(Ui.color(view.context,R.color.risk_medium)),lineWidth(6f),lineDasharray(arrayOf(3f,2f))))
                s.addLayer(CircleLayer("nearby-place-dots","nearby-places").withProperties(circleRadius(5f),circleColor(Ui.color(view.context,R.color.purple_primary)),circleStrokeWidth(2f),circleStrokeColor(Ui.color(view.context,R.color.surface))))
                s.addImage("police-marker",helpMarker(true));s.addImage("hospital-marker",helpMarker(false))
                s.addLayer(SymbolLayer("help-place-symbols","help-places").withProperties(iconImage(Expression.get("marker")),iconAllowOverlap(false),iconIgnorePlacement(false),iconPadding(10f)).apply{minZoom=12f})
                s.addLayer(CircleLayer("endpoint-dots","endpoints").withProperties(circleRadius(6f),circleColor(Ui.color(view.context,R.color.purple_primary)),circleStrokeWidth(3f),circleStrokeColor(Ui.color(view.context,R.color.surface))))
                s.addLayer(CircleLayer("position-halo","position").withProperties(circleRadius(18f),circleColor(Ui.color(view.context,R.color.purple_primary)),circleOpacity(.18f)))
                s.addLayer(CircleLayer("position-dot","position").withProperties(circleRadius(7f),circleColor(Ui.color(view.context,R.color.purple_primary)),circleStrokeWidth(3f),circleStrokeColor(Ui.color(view.context,R.color.surface))))
                m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(22.56,88.35),13.0));draw(!navigating);updatePosition();drawAvoidance();followPosition(false);onReady?.invoke()
            }
            m.addOnMapLongClickListener{p->onPick?.invoke(Place("Selected map location",p.latitude,p.longitude));true}
            m.addOnMapClickListener{p->val screen=m.projection.toScreenLocation(p);val features=m.queryRenderedFeatures(android.graphics.RectF(screen.x-12,screen.y-12,screen.x+12,screen.y+12),"alternative-lines");val feature=features.firstOrNull();if(feature!=null){onSelect?.invoke(feature.getStringProperty("route_id"));true}else{
                val r=options.firstOrNull{it.routeId==selected}?:options.firstOrNull()
                val poi=m.queryRenderedFeatures(android.graphics.RectF(screen.x-18,screen.y-18,screen.x+18,screen.y+18),"help-place-symbols","nearby-place-dots").firstOrNull()
                if(poi!=null){r?.environment?.let{e->(e.helpPlaces.orEmpty()+e.nearbyPlaces.orEmpty()+e.facilities.orEmpty()).firstOrNull{it.id==poi.getStringProperty("place_id")}?.let{onPlace?.invoke(it)}};true}
                else{val a=m.queryRenderedFeatures(screen,"report-area-fill").firstOrNull();if(a!=null){r?.environment?.reportAreas.orEmpty().firstOrNull{it.id==a.getStringProperty("area_id")}?.let{onArea?.invoke(it)};true}else false}
            }}
            m.addOnCameraMoveStartedListener{reason->if(reason==MapboxMap.OnCameraMoveStartedListener.REASON_API_GESTURE)follow=false}
        }
    }
    private fun lines(r:RouteOption,alternative:Boolean=false):List<Feature>{
        val preview=r.preview
        val parts=preview?.stretches.orEmpty().filter{s->s.geometry.size>1&&s.geometry.all{it.size==2}}
        fun feature(points:List<List<Double>>,tint:Int)=Feature.fromGeometry(LineString.fromLngLats(points.map{Point.fromLngLat(it[0],it[1])})).apply{
            addStringProperty("route_id",r.routeId);addStringProperty("route_color",String.format(java.util.Locale.ROOT,"#%06X",Ui.color(view.context,tint) and 0xFFFFFF))
        }
        return if(parts.isNotEmpty())parts.map{feature(it.geometry,Ui.riskColor(it.level))}else listOf(feature(r.geometry,if(alternative)R.color.on_surface_secondary else R.color.purple_primary))
    }
    private fun source(id:String,features:List<Feature>){style?.getSourceAs<GeoJsonSource>(id)?.setGeoJson(FeatureCollection.fromFeatures(features))}
    fun routes(routes:List<RouteOption>,selectedId:String?,fit:Boolean=true){options=routes;selected=selectedId;draw(fit);if(navigating)followPosition(false)}
    private fun draw(fit:Boolean){
        val m=map?:return;if(style==null)return
        previewLabel.visibility=if(options.any{it.preview!=null})android.view.View.VISIBLE else android.view.View.GONE
        source("alternatives",options.filter{it.routeId!=selected}.flatMap{lines(it,true)})
        val r=options.firstOrNull{it.routeId==selected}?:options.firstOrNull()
        source("selected",r?.let{lines(it)}.orEmpty())
        listOf("unknown","reports","high","medium").forEach{level->source(level,r?.segments?.filter{(if(level=="reports")it.evidenceCount>0 else if(!r.isDemoData)level=="unknown"&&r.preview==null else it.level.equals(level,true))&&it.startIndex in r.geometry.indices&&it.endIndex in r.geometry.indices}?.map{s->Feature.fromGeometry(LineString.fromLngLats(r.geometry.subList(s.startIndex,s.endIndex+1).map{Point.fromLngLat(it[0],it[1])}))}.orEmpty())}
        val endpointPoints=r?.geometry?.takeIf{it.size>1}?.let{listOf(requestedOrigin?.let{p->listOf(p.longitude,p.latitude)}?:it.first(),requestedDestination?.let{p->listOf(p.longitude,p.latitude)}?:it.last())}.orEmpty()
        drawDetails(r)
        source("endpoints",endpointPoints.map{p->Feature.fromGeometry(Point.fromLngLat(p[0],p[1]))})
        if(fit&&r!=null&&r.geometry.size>1)view.post{if(!navigating||!follow)runCatching{m.animateCamera(CameraUpdateFactory.newLatLngBounds(LatLngBounds.Builder().includes((options.flatMap{it.geometry}+endpointPoints).map{LatLng(it[1],it[0])}).build(),Ui.dp(view.context,40)))}}
    }
    fun detailLayer(layer:String){detailLayer=layer;draw(false)}
    private fun drawDetails(r:RouteOption?){
        val env=r?.environment
        source("report-areas",if(detailLayer=="REPORTS")env?.reportAreas.orEmpty().mapNotNull{a->runCatching{
            val geometry=if(a.geometry.get("type").asString=="Polygon")Polygon.fromJson(a.geometry.toString()) else MultiPolygon.fromJson(a.geometry.toString())
            Feature.fromGeometry(geometry).apply{addStringProperty("area_id",a.id)}
        }.getOrNull()}else emptyList())
        for((name,states) in listOf("lit-stretches" to listOf("MAPPED_LIT","OBSERVED_WORKING"),"unlit-stretches" to listOf("MAPPED_UNLIT","OBSERVED_OUT"))){
            val fresh=runCatching{java.time.Instant.parse(env?.validUntil).toEpochMilli()>System.currentTimeMillis()}.getOrDefault(false)
            source(name,if(detailLayer=="LIGHTING"&&r!=null&&fresh&&!env!!.stale)env.stretches.orEmpty().filter{it.lighting in states&&it.startIndex in r.geometry.indices&&it.endIndex in r.geometry.indices}.map{Feature.fromGeometry(LineString.fromLngLats(r.geometry.subList(it.startIndex,it.endIndex+1).map{p->Point.fromLngLat(p[0],p[1])}))}else emptyList())
        }
        source("nearby-places",if(detailLayer=="PLACES")((env?.facilities.orEmpty()+env?.nearbyPlaces.orEmpty()).distinctBy{it.id}).take(3).filter{it.point.size==2}.map{p->Feature.fromGeometry(Point.fromLngLat(p.point[0],p.point[1])).apply{addStringProperty("place_id",p.id)}}else emptyList())
        val help=(env?.helpPlaces.orEmpty()+env?.facilities.orEmpty()+env?.nearbyPlaces.orEmpty()).distinctBy{it.id}.filter{it.point.size==2}
        val limited=help.filter{it.category=="police"}.take(2)+help.filter{it.category=="hospital"}.take(2)
        source("help-places",limited.map{p->Feature.fromGeometry(Point.fromLngLat(p.point[0],p.point[1])).apply{addStringProperty("place_id",p.id);addStringProperty("marker",if(p.category=="police")"police-marker" else "hospital-marker")}})
    }
    private fun updatePosition(){source("position",current?.let{listOf(Feature.fromGeometry(Point.fromLngLat(it.longitude,it.latitude)))}.orEmpty())}
    fun avoidAreas(areas:List<AvoidArea>){avoided=areas;drawAvoidance()}
    private fun drawAvoidance(){source("avoidance",avoided.map{area->
        val longitude=area.center[0];val latitude=area.center[1]
        val ring=(0..32).map{i->val angle=i*Math.PI/16;Point.fromLngLat(longitude+kotlin.math.cos(angle)*area.radiusMeters/(111320*kotlin.math.cos(latitude*Math.PI/180)),latitude+kotlin.math.sin(angle)*area.radiusMeters/111320)}
        Feature.fromGeometry(Polygon.fromLngLats(listOf(ring)))
    })}
    fun navigation(){navigating=true;follow=true;map?.uiSettings?.isCompassEnabled=true;followPosition(false)}
    fun location(fix:LocationFix){if(current==fix)return
        if(navigating&&TripMath.validFix(fix)&&fix.accuracy>0&&fix.accuracy<=50){
            val anchor=headingAnchor
            val motion=anchor?.let{TripMath.movementBearing(it,fix)}
            if(motion!=null){movementHeading=motion;movementUntil=fix.timestampMs+15000;headingAnchor=fix}
            else if(anchor==null||fix.timestampMs-anchor.timestampMs>30000)headingAnchor=fix
        }
        current=fix;updatePosition();if(follow)followPosition(true)
    }
    private fun followPosition(animated:Boolean){
        if(!follow)return;val m=map?:return;val fix=current?:return
        if(!TripMath.validFix(fix)||fix.accuracy<=0||fix.accuracy>50)return
        val route=options.firstOrNull{it.routeId==selected}?:options.firstOrNull()
        if(navigating&&route!=null){(movementHeading?.takeIf{System.currentTimeMillis()<movementUntil}?:TripMath.navigationBearing(route,fix))?.let{next->
            val old=heading;heading=if(old==null)next else (old+(((next-old+540)%360)-180)*.5+360)%360
        }}
        val camera=CameraPosition.Builder().target(LatLng(fix.latitude,fix.longitude)).zoom(if(navigating)16.6 else 16.0).bearing(if(navigating)heading?:0.0 else 0.0).tilt(if(navigating)30.0 else 0.0).build()
        if(animated)m.animateCamera(CameraUpdateFactory.newCameraPosition(camera),700)else m.moveCamera(CameraUpdateFactory.newCameraPosition(camera))
    }
    fun recenter(){follow=true;followPosition(true)}
    fun overview(){follow=false;draw(true)}
    fun endpoints(origin:Place?,destination:Place?,fit:Boolean=false){
        requestedOrigin=origin;requestedDestination=destination
        val fallback=options.firstOrNull{it.routeId==selected}?.geometry
        val points=listOfNotNull(origin?:fallback?.firstOrNull()?.let{Place("Walking start",it[1],it[0])},destination?:fallback?.lastOrNull()?.let{Place("Walking destination",it[1],it[0])})
        source("endpoints",points.map{Feature.fromGeometry(Point.fromLngLat(it.longitude,it.latitude))})
        if(fit&&style!=null){if(points.size==1)showPoint(points.first())else if(points.size>1)map?.animateCamera(CameraUpdateFactory.newLatLngBounds(LatLngBounds.Builder().includes(points.map{LatLng(it.latitude,it.longitude)}).build(),Ui.dp(view.context,40)))}
    }
    fun showPoint(place:Place){map?.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(place.latitude,place.longitude),15.0))}
    fun destroy(){view.onDestroy();map=null;style=null}
    private fun helpMarker(police:Boolean):android.graphics.Bitmap{
        val size=Ui.dp(view.context,28);val bitmap=android.graphics.Bitmap.createBitmap(size,size,android.graphics.Bitmap.Config.ARGB_8888)
        bitmap.density=view.context.resources.displayMetrics.densityDpi
        val canvas=android.graphics.Canvas(bitmap);canvas.scale(size/28f,size/28f)
        val paint=android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
        paint.color=Ui.color(view.context,R.color.surface);canvas.drawCircle(14f,14f,13f,paint)
        paint.color=Ui.color(view.context,if(police)R.color.purple_primary else R.color.risk_high);canvas.drawCircle(14f,14f,11f,paint)
        paint.color=android.graphics.Color.WHITE
        if(police){val path=android.graphics.Path().apply{moveTo(14f,6f);lineTo(20f,9f);lineTo(19f,16f);quadTo(17f,20f,14f,22f);quadTo(11f,20f,9f,16f);lineTo(8f,9f);close()};canvas.drawPath(path,paint)}
        else{canvas.drawRoundRect(12f,7f,16f,21f,1f,1f,paint);canvas.drawRoundRect(7f,12f,21f,16f,1f,1f,paint)}
        return bitmap
    }
}
