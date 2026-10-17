"""Do not change a confirmed animal species on a track because one crop changes."""
from p068_vision.tracking import iou


class PetTemporal:
    def __init__(self,*,max_gap_seconds=1.):
        import math
        if not math.isfinite(max_gap_seconds) or max_gap_seconds<=0:
            raise ValueError('Invalid pet temporal gap')
        self.tracks={}
        self.max_gap_seconds=max_gap_seconds

    def update(self,rows,now):
        self.tracks={key:value for key,value in self.tracks.items() if 0<=now-value['seen']<=self.max_gap_seconds}
        pets=[d for d in rows if d['class'] in {'cat','dog','pet_unknown'} and d.get('track_id') is not None]
        for d in pets:
            key=d['track_id']
            raw=d['class']
            state=self.tracks.get(key)
            if state and iou(state['box'],d['bbox'])<.3:
                state=None
            state=state or dict(confirmed=None,proposal=None,streak=0)
            conflicting_neighbor=any(other['track_id']!=key and
                self.tracks.get(other['track_id'],{}).get('confirmed') not in (None,raw) and
                iou(other['bbox'],d['bbox'])>=.3 for other in pets)
            species=d.get('pet_species',{})
            good=(raw in {'cat','dog'} and species.get('label',raw)==raw
                  and species.get('top_probability',0)>=.3 and not conflicting_neighbor)
            if state['confirmed'] is None and good:
                state['streak']=state['streak']+1 if state['proposal']==raw else 1
                state['proposal']=raw
                if state['streak']>=3:
                    state['confirmed']=raw
            elif state['confirmed'] is None:
                state['streak']=0
                state['proposal']=None
            d['pet_raw_species']=raw
            d['class']=raw if raw==state['confirmed'] and not conflicting_neighbor else 'pet_unknown'
            d['pet_temporal']=dict(confirmed_species=state['confirmed'],
                conflict=state['confirmed'] not in (None,raw) or conflicting_neighbor,
                reason='Species conflict remains unknown; reset only with a new/expired track')
            state.update(seen=now,box=list(d['bbox']))
            self.tracks[key]=state
