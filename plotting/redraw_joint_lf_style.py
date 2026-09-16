"""Render the immutable joint snapshot using the current LF-only visual grammar."""
import argparse
import json
from pathlib import Path
import h5py
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import MaxNLocator
from scipy.ndimage import gaussian_filter
from workflows.MCMC.fixed_btps_posterior.analysis.corner_style import (
    JOINT_LABELS, LF_LABELS, native_stellar_ensembles, sha256_file,
)

STYLE = 'joint-white-lf-style-v1'


def render(arrays, labels, output):
    colors = ['#B84B3E', '#2878B5']
    styles = ['-', '--']
    quantiles = [np.quantile(x, [.16,.5,.84], axis=0) for x in arrays]
    edges = []
    for j in range(7):
        lo=min(x[:,j].min() for x in arrays)
        hi=max(x[:,j].max() for x in arrays)
        pad=max(.025*(hi-lo),1e-6)
        edges.append(np.linspace(lo-pad,hi+pad,61))
    with plt.rc_context({'font.family':'DejaVu Sans','font.size':11,
                         'axes.spines.top':False,'axes.spines.right':False}):
        fig, axes=plt.subplots(7,7,figsize=(18,18))
        annotations=[]
        for i in range(7):
            for j in range(7):
                ax=axes[i,j]
                if j>i:
                    ax.set_visible(False)
                    continue
                for e,(x,c,ls,q) in enumerate(zip(arrays,colors,styles,quantiles)):
                    if i==j:
                        ax.hist(x[:,i],bins=edges[i],density=True,histtype='step',lw=1.5,color=c,ls=ls)
                        for v in q[:,i]:
                            ax.axvline(v,color=c,lw=.7,ls=':',alpha=.5)
                        lo,med,hi=q[:,i]
                        annotations.append(ax.text(.5,1.38-e*.24,
                            f'E{e}: '+rf'${med:.2f}^{{+{hi-med:.2f}}}_{{-{med-lo:.2f}}}$',
                            color=c,ha='center',transform=ax.transAxes,fontsize=10))
                    else:
                        h,xe,ye=np.histogram2d(x[:,j],x[:,i],bins=(edges[j],edges[i]))
                        h=gaussian_filter(h,1.0)
                        ranked=np.sort(h.ravel())[::-1]
                        cdf=np.cumsum(ranked)/ranked.sum()
                        levels=sorted(set(ranked[min(np.searchsorted(cdf,p),len(ranked)-1)] for p in (.95,.68)))
                        levels=[v for v in levels if 0<v<h.max()]
                        if levels:
                            ax.contour((xe[1:]+xe[:-1])/2,(ye[1:]+ye[:-1])/2,h.T,
                                       levels=levels,colors=[c],linestyles=ls,linewidths=1.3)
                ax.set_xlim(edges[j][0],edges[j][-1])
                if i!=j: ax.set_ylim(edges[i][0],edges[i][-1])
                else: ax.set_yticks([])
                ax.xaxis.set_major_locator(MaxNLocator(nbins=3,prune='both'))
                if i!=j: ax.yaxis.set_major_locator(MaxNLocator(nbins=3,prune='both'))
                ax.tick_params(direction='in',labelsize=9,labelbottom=i==6,labelleft=j==0 and i>0)
                if i==6: ax.set_xlabel(labels[j],fontsize=12,labelpad=9)
                if j==0 and i>0: ax.set_ylabel(labels[i],fontsize=12,labelpad=10)
        fig.subplots_adjust(left=.085,right=.98,bottom=.14,top=.865,wspace=.24,hspace=.70)
        fig.text(.085,.975,r'LF + $\tau_e$ + $x_{\rm HI}$ | fixed $k_p=1\ h\,\mathrm{Mpc}^{-1}$; free $m_s$',fontsize=17)
        fig.text(.085,.947,'PRELIMINARY / NOT CONVERGED — same model, two independent ensembles',fontsize=12,color='#637080')
        fig.legend([Line2D([],[],color=c,ls=ls,lw=2) for c,ls in zip(colors,styles)],
                   ['E0 / independent ensemble 0','E1 / independent ensemble 1'],
                   loc='upper left',bbox_to_anchor=(.57,.84),frameon=False,fontsize=13)
        fig.text(.58,.75,'LF-only visual style; joint-likelihood samples\n\nNot BPL versus PL; no LF-only samples mixed in\n\n160 saved steps × 64 walkers per ensemble\nInitial burn-in: 40 steps; no additional discard',fontsize=12,linespacing=1.7,color='#637080',va='top')
        fig.text(.085,.045,'Marginal labels: empirical median and 16–84% range, not validated posterior constraints.\nContours: 68% / 95% mass of 60-bin histograms smoothed with Gaussian σ = 1 bin (display only).\nFull sample ranges retained; no new sampling, thinning, clipping or reweighting.',fontsize=11,color='#637080',linespacing=1.7)
        fig.canvas.draw()
        renderer=fig.canvas.get_renderer()
        texts=annotations+list(fig.texts)
        for legend in fig.legends:
            texts.extend(legend.get_texts())
        for ax in axes.flat:
            if ax.get_visible():
                texts.extend(t for t in [*ax.get_xticklabels(),*ax.get_yticklabels(),ax.xaxis.label,ax.yaxis.label] if t.get_visible() and t.get_text())
        boxes=[t.get_window_extent(renderer) for t in texts]
        clipped=[texts[i].get_text() for i,b in enumerate(boxes) if b.x0<0 or b.y0<0 or b.x1>fig.bbox.width or b.y1>fig.bbox.height]
        overlaps=[]
        for i,a in enumerate(boxes):
            for j,b in enumerate(boxes[i+1:],i+1):
                if min(a.x1,b.x1)-max(a.x0,b.x0)>1 and min(a.y1,b.y1)-max(a.y0,b.y0)>1:
                    overlaps.append([texts[i].get_text(),texts[j].get_text()])
        if clipped or overlaps:
            raise ValueError({'clipped':clipped,'overlaps':overlaps})
        fig.savefig(output,dpi=160)
        plt.close(fig)
    return {'style':STYLE,'passed':True,'clipped_text':clipped,'text_overlaps':overlaps,
            'dimensions':7,'samples_per_ensemble':[len(x) for x in arrays],
            'bins_1d':60,'bins_2d':60,'smoothing_sigma_bins':1.0,'quantiles': [q.tolist() for q in quantiles]}


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--site',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    a=p.parse_args()
    a.output.mkdir(parents=True,exist_ok=False)
    metadata=json.loads((a.site/'web_data/ms_corner_chunk1/index.json').read_text())
    arrays=[]
    for source in metadata['sources']:
        path=Path(source['file'])
        assert sha256_file(path)==source['sha256']
        with h5py.File(path,'r') as h:
            x=h['chain'][:]
            assert list(x.shape)==source['shape']==[160,64,7]
            arrays.append(x.reshape(-1,7))
    audits={}
    for filename,values,labels in [('corner_eta.png',arrays,list(JOINT_LABELS)),
           ('corner_native.png',native_stellar_ensembles(arrays),[LF_LABELS[0],*JOINT_LABELS[1:]])]:
        audits[filename]=render(values,labels,a.output/filename)
        print(filename,'layout passed',flush=True)
    metadata['figure_style']=STYLE
    metadata['figure_sha256']={f:sha256_file(a.output/f) for f in audits}
    metadata['rendering']={'based_on':'LF-only white corner design','colors':{'ensemble0':'#B84B3E','ensemble1':'#2878B5'},
                           'line_styles':{'ensemble0':'solid','ensemble1':'dashed'},'smoothing_sigma_bins':1.0,
                           'note':'Display smoothing only; same original snapshot and diagnostic status'}
    (a.output/'index.json').write_text(json.dumps(metadata,indent=2)+'\n')
    (a.output/'layout_audit.json').write_text(json.dumps(audits,indent=2)+'\n')


if __name__=='__main__': main()
