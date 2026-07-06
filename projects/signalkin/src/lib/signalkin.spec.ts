import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Signalkin } from './signalkin';

describe('Signalkin', () => {
  let component: Signalkin;
  let fixture: ComponentFixture<Signalkin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Signalkin],
    }).compileComponents();

    fixture = TestBed.createComponent(Signalkin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
